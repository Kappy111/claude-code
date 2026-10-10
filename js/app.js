// VidToText — main app controller.
import * as DB from './db.js';
import { fetchMedia, decodeToMono16k, isPageLike, isYouTube, formatTime, triggerDownload } from './media.js';
import { fetchYouTubeAudio } from './youtube.js';
import { transcribe } from './transcribe.js';
import { summarize } from './summarize.js';
import { diarize, SPEAKER_COLORS } from './diarize.js';
import { translate, LANG_NAMES } from './translate.js';

const $ = (id) => document.getElementById(id);
const PROFILE_KEY = 'vidtotext.profile';

// -------- app state --------
const state = {
  source: 'url',       // 'url' | 'file'
  file: null,          // selected File
  objectUrl: null,     // video object URL
  pcm: null,           // Float32Array @16k for current media
  session: null,       // current session object
  activeStore: 'browser',
};

// ---------------- toasts ----------------
function toast(message, kind = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="ti"></span><span></span>`;
  el.lastElementChild.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}

// ---------------- auth ----------------
function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; } }
function saveProfile(p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }

function showApp(profile) {
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  const name = profile.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  $('user-name').textContent = name || 'User';
  $('user-email').textContent = profile.email;
  $('avatar').textContent = (name || profile.email)[0].toUpperCase();
  refreshHistory();
}

function initAuth() {
  const existing = loadProfile();
  if (existing?.email) showApp(existing);

  $('auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('auth-email').value.trim();
    if (!email) return;
    const profile = { email, createdAt: Date.now() };
    saveProfile(profile);
    showApp(profile);
    toast(`Signed in as ${email}`, 'success');
  });

  document.querySelectorAll('.social-btn').forEach(b => b.addEventListener('click', () => {
    toast(`${b.dataset.provider} sign-in isn't available in the local demo — enter an email to continue.`, 'info');
  }));

  $('sign-out').addEventListener('click', () => {
    localStorage.removeItem(PROFILE_KEY);
    $('app').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
    $('auth-email').value = '';
  });
}

// ---------------- input tabs ----------------
function initInputTabs() {
  const setSource = (src) => {
    state.source = src;
    $('src-url').classList.toggle('active', src === 'url');
    $('src-file').classList.toggle('active', src === 'file');
    $('pane-url').classList.toggle('hidden', src !== 'url');
    $('pane-file').classList.toggle('hidden', src !== 'file');
    updateTranscribeEnabled();
  };
  $('src-url').addEventListener('click', () => setSource('url'));
  $('src-file').addEventListener('click', () => setSource('file'));

  $('url-input').addEventListener('input', updateTranscribeEnabled);

  const dz = $('dropzone'), fileInput = $('file-input');
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) setFile(f); });
}

function setFile(file) {
  state.file = file;
  $('dropzone').classList.add('has-file');
  $('dz-text').textContent = file.name;
  $('dz-sub').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  updateTranscribeEnabled();
}

function updateTranscribeEnabled() {
  const ok = state.source === 'file' ? !!state.file : !!$('url-input').value.trim();
  $('transcribe-btn').disabled = !ok;
}

// ---------------- progress ----------------
function setProgress(pct, text) {
  $('progress').classList.remove('hidden');
  if (pct != null) $('progress-fill').style.width = `${Math.round(pct * 100)}%`;
  if (text != null) $('progress-text').textContent = text;
}
function hideProgress() { $('progress').classList.add('hidden'); $('progress-fill').style.width = '0%'; }

// ---------------- transcription flow ----------------
async function runTranscribe() {
  const btn = $('transcribe-btn');
  btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Transcribing locally…';
  $('result').classList.add('hidden');

  try {
    let blob, name, sourceLabel;
    if (state.source === 'file') {
      blob = state.file; name = state.file.name; sourceLabel = 'Local file';
    } else {
      const url = $('url-input').value.trim();
      if (isYouTube(url)) {
        setProgress(0, 'Fetching YouTube audio…');
        const yt = await fetchYouTubeAudio(url, {
          onStatus: (m) => setProgress(null, m),
          onProgress: (p) => setProgress(p, `Downloading audio… ${Math.round(p * 100)}%`),
        });
        blob = yt.blob;
        name = (yt.title || 'youtube-video').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.m4a';
        sourceLabel = url;
      } else if (isPageLike(url)) {
        throw new Error('That looks like a web page, not a direct media link. Paste a direct .mp3/.mp4/.wav URL, a YouTube link, or upload a file.');
      } else {
        setProgress(0, 'Downloading media…');
        blob = await fetchMedia(url, (p) => setProgress(p, `Downloading media… ${Math.round(p * 100)}%`));
        name = url.split('/').pop().split('?')[0] || 'remote-media';
        sourceLabel = url;
      }
    }

    // Video preview
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(blob);
    $('player').src = state.objectUrl;

    // Decode audio
    setProgress(null, 'Decoding audio…');
    const { pcm, duration } = await decodeToMono16k(blob);
    state.pcm = pcm.slice(); // keep a copy for diarization (worker transfers the other)

    // Transcribe
    const model = $('model-select').value;
    const result = await transcribe(pcm, model, {
      onStatus: (m) => setProgress(null, m),
      onProgress: (p) => {
        if (p.phase === 'download' && p.pct != null) setProgress(p.pct, `Loading Whisper model… ${Math.round(p.pct * 100)}%`);
        else if (p.phase === 'ready') setProgress(1, 'Model ready — transcribing…');
      },
    });

    if (!result.chunks.length && !result.text) throw new Error('No speech detected in this media.');

    // Optional downloads
    if (state.source === 'file' || $('opt-video').checked || $('opt-audio').checked) {
      if ($('opt-video').checked && blob.type.startsWith('video')) triggerDownload(blob, name);
      if ($('opt-audio').checked && state.source === 'url') triggerDownload(blob, name);
    }

    const session = {
      id: `s_${Date.now()}`,
      title: name.replace(/\.[^.]+$/, ''),
      createdAt: Date.now(),
      source: sourceLabel,
      language: 'AUTO',
      duration,
      device: result.device,
      model,
      text: result.text,
      chunks: result.chunks,
      speakers: null,
      summary: null,
      translation: null,
    };
    state.session = session;
    await DB.putSession('browser', session);
    renderResult(session);
    refreshHistory();
    toast(`Transcribed with Whisper (${result.device.toUpperCase()}).`, 'success');
  } catch (err) {
    toast(err.message || 'Transcription failed.', 'error', 6000);
  } finally {
    hideProgress();
    btn.disabled = false; btn.classList.remove('busy'); btn.textContent = 'Transcribe';
    updateTranscribeEnabled();
  }
}

// ---------------- result rendering ----------------
function renderResult(session) {
  $('result').classList.remove('hidden');
  $('result-title').textContent = session.title;
  $('result-lang').textContent = session.language || 'AUTO';
  $('result-source').textContent = session.source?.length > 48 ? session.source.slice(0, 48) + '…' : (session.source || 'Local file');
  if (state.objectUrl) $('player').src = state.objectUrl; else $('player').removeAttribute('src');

  renderSegments(session);

  // Reset tabs/views
  switchTab('transcript');
  $('rt-summary').disabled = !session.summary;
  $('rt-translation').disabled = !session.translation;
  $('summary-body').innerHTML = session.summary ? summaryHtml(session.summary) : '';
  $('translation-body').innerHTML = session.translation ? translationHtml(session.translation) : '';
  $('save-db').classList.remove('ok');
  $('player').closest('.video-card').style.display = state.objectUrl ? '' : 'none';
}

function renderSegments(session) {
  const wrap = $('segments');
  wrap.innerHTML = '';
  const chunks = session.chunks || [];
  if (!chunks.length) {
    wrap.innerHTML = `<p class="muted-block">${escapeHtml(session.text || 'No transcript.')}</p>`;
    return;
  }
  chunks.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'seg-row';
    row.dataset.start = c.start ?? 0;
    let spk = '';
    if (session.speakers && session.speakers[i] != null) {
      const s = session.speakers[i];
      const color = SPEAKER_COLORS[s % SPEAKER_COLORS.length];
      spk = `<span class="spk" style="background:${hexA(color, .18)};color:${color}">Speaker ${s + 1}</span>`;
    }
    row.innerHTML = `<div class="seg-time">${formatTime(c.start)}</div><div class="seg-text">${spk}${escapeHtml(c.text)}</div>`;
    row.addEventListener('click', () => {
      const p = $('player');
      p.currentTime = c.start ?? 0;
      p.play().catch(() => {});
    });
    wrap.appendChild(row);
  });

  // highlight active segment as video plays
  const player = $('player');
  player.ontimeupdate = () => {
    const t = player.currentTime;
    const rows = wrap.querySelectorAll('.seg-row');
    let activeIdx = -1;
    chunks.forEach((c, i) => { if (t >= (c.start ?? 0)) activeIdx = i; });
    rows.forEach((r, i) => r.classList.toggle('active', i === activeIdx));
  };
}

function switchTab(which) {
  $('rt-transcript').classList.toggle('active', which === 'transcript');
  $('rt-summary').classList.toggle('active', which === 'summary');
  $('rt-translation').classList.toggle('active', which === 'translation');
  $('view-transcript').classList.toggle('hidden', which !== 'transcript');
  $('view-summary').classList.toggle('hidden', which !== 'summary');
  $('view-translation').classList.toggle('hidden', which !== 'translation');
}

function summaryHtml(summary) {
  const pts = summary.points?.length ? `<ul>${summary.points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : '';
  return `<h4>Summary <span class="muted-block">· ${escapeHtml(summary.engine)}</span></h4>` +
         `<p>${escapeHtml(summary.text)}</p>` +
         (pts ? `<h4 style="margin-top:18px">Key points</h4>${pts}` : '');
}
function translationHtml(tr) {
  return `<h4>${escapeHtml(LANG_NAMES[tr.target] || tr.target)} <span class="muted-block">· ${escapeHtml(tr.engine)}</span></h4>` +
         `<p>${escapeHtml(tr.text)}</p>`;
}

// ---------------- toolbar actions ----------------
function plainText(session) {
  if (session.chunks?.length) return session.chunks.map(c => c.text).join(' ');
  return session.text || '';
}

async function doSummarize() {
  const s = state.session; if (!s) return;
  const btn = $('summarize-btn'); btn.disabled = true;
  const old = btn.innerHTML; btn.innerHTML = '⏳ Summarizing…';
  try {
    const out = await summarize(plainText(s));
    s.summary = out;
    await persistCurrent();
    $('summary-body').innerHTML = summaryHtml(out);
    $('rt-summary').disabled = false;
    switchTab('summary');
    toast(`Summary ready (${out.engine}).`, 'success');
  } catch (err) {
    toast(err.message || 'Could not summarize.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = old;
  }
}

async function doDiarize() {
  const s = state.session; if (!s) return;
  if (!state.pcm) { toast('Audio no longer in memory — re-transcribe to diarize.', 'error'); return; }
  const btn = $('diarize-btn'); btn.disabled = true;
  const old = btn.innerHTML; btn.innerHTML = '⏳ Detecting speakers…';
  try {
    const n = Math.max(1, Math.min(4, Number(prompt('How many speakers? (1–4)', '2')) || 2));
    // Run on a microtask so the UI can paint the busy state.
    await new Promise(r => setTimeout(r, 20));
    const labels = diarize(s.chunks, state.pcm, n);
    s.speakers = labels;
    await persistCurrent();
    renderSegments(s);
    switchTab('transcript');
    const found = new Set(labels).size;
    toast(`Labeled ${found} speaker${found > 1 ? 's' : ''} across ${labels.length} segments.`, 'success');
  } catch (err) {
    toast(err.message || 'Speaker detection failed.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = old;
  }
}

async function doTranslate() {
  const s = state.session; if (!s) return;
  const target = $('lang-select').value;
  const btn = $('translate-btn'); btn.disabled = true;
  const old = btn.innerHTML; btn.innerHTML = '⏳ Translating…';
  try {
    const out = await translate(plainText(s), target, { onStatus: (m) => { btn.innerHTML = `⏳ ${m}`; } });
    s.translation = { target, text: out.text, engine: out.engine };
    await persistCurrent();
    $('translation-body').innerHTML = translationHtml(s.translation);
    $('rt-translation').disabled = false;
    switchTab('translation');
    toast(`Translated to ${LANG_NAMES[target]} (${out.engine}).`, 'success');
  } catch (err) {
    toast(err.message || 'Translation failed.', 'error', 6000);
  } finally {
    btn.disabled = false; btn.innerHTML = old;
  }
}

async function persistCurrent() {
  if (!state.session) return;
  await DB.putSession('browser', state.session);
  // keep "saved" copy in sync if it exists
  const saved = await DB.getSession('saved', state.session.id);
  if (saved) await DB.putSession('saved', state.session);
}

function initToolbar() {
  $('summarize-btn').addEventListener('click', doSummarize);
  $('diarize-btn').addEventListener('click', doDiarize);
  $('translate-btn').addEventListener('click', doTranslate);
  $('rt-transcript').addEventListener('click', () => switchTab('transcript'));
  $('rt-summary').addEventListener('click', () => !$('rt-summary').disabled && switchTab('summary'));
  $('rt-translation').addEventListener('click', () => !$('rt-translation').disabled && switchTab('translation'));

  $('copy-btn').addEventListener('click', async () => {
    const s = state.session; if (!s) return;
    try { await navigator.clipboard.writeText(buildExport(s)); toast('Transcript copied.', 'success'); }
    catch { toast('Clipboard not available.', 'error'); }
  });
  $('download-btn').addEventListener('click', () => {
    const s = state.session; if (!s) return;
    triggerDownload(new Blob([buildExport(s)], { type: 'text/plain' }), `${s.title}.txt`);
  });
  $('save-db').addEventListener('click', async () => {
    const s = state.session; if (!s) return;
    await DB.putSession('saved', s);
    $('save-db').classList.add('ok');
    toast('Saved to your database (this browser).', 'success');
    if (state.activeStore === 'saved') refreshHistory();
  });
}

function buildExport(s) {
  const lines = [];
  lines.push(s.title);
  lines.push(`Source: ${s.source}`);
  lines.push(`Transcribed on-device with Whisper (${(s.model || '').split('/').pop()})`);
  lines.push('');
  if (s.chunks?.length) {
    s.chunks.forEach((c, i) => {
      const spk = s.speakers?.[i] != null ? `[Speaker ${s.speakers[i] + 1}] ` : '';
      lines.push(`[${formatTime(c.start)}] ${spk}${c.text}`);
    });
  } else {
    lines.push(s.text || '');
  }
  if (s.summary) { lines.push('', '--- SUMMARY ---', s.summary.text); }
  if (s.translation) { lines.push('', `--- TRANSLATION (${LANG_NAMES[s.translation.target] || s.translation.target}) ---`, s.translation.text); }
  return lines.join('\n');
}

// ---------------- history ----------------
async function refreshHistory() {
  const list = await DB.getAll(state.activeStore);
  const q = $('search').value.trim().toLowerCase();
  const filtered = q ? list.filter(s => (s.title + ' ' + (s.text || '')).toLowerCase().includes(q)) : list;
  const wrap = $('session-list');
  $('clear-all').classList.toggle('hidden', list.length === 0);

  if (!filtered.length) {
    wrap.innerHTML = `<p class="empty-note">${list.length ? 'No sessions match your search.' : 'No sessions yet. Transcribe something to get started.'}</p>`;
    return;
  }
  wrap.innerHTML = '';
  filtered.forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-item' + (state.session?.id === s.id ? ' active' : '');
    const snippet = escapeHtml((s.text || '').slice(0, 120));
    item.innerHTML =
      `<div class="si-title">${escapeHtml(s.title)}</div>` +
      `<div class="si-snippet">${snippet}</div>` +
      `<div class="si-foot"><span>${escapeHtml((s.source || '').startsWith('http') ? 'URL' : 'Local file')}</span>` +
      `<span>· ${formatTime(s.duration)}</span>` +
      `<button class="si-del" title="Delete">🗑</button></div>`;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('si-del')) return;
      openSession(s);
    });
    item.querySelector('.si-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await DB.deleteSession(state.activeStore, s.id);
      if (state.session?.id === s.id) { state.session = null; $('result').classList.add('hidden'); }
      refreshHistory();
    });
    wrap.appendChild(item);
  });
}

function openSession(s) {
  state.session = s;
  state.pcm = null; // audio not retained across reloads; diarization needs re-transcribe
  if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
  $('player').removeAttribute('src');
  renderResult(s); // hides the video card when no object URL is live (URLs don't persist across reloads)
  refreshHistory();
  $('result').scrollIntoView({ behavior: 'smooth' });
}

function initHistory() {
  $('tab-browser').addEventListener('click', () => { state.activeStore = 'browser'; $('tab-browser').classList.add('active'); $('tab-saved').classList.remove('active'); refreshHistory(); });
  $('tab-saved').addEventListener('click', () => { state.activeStore = 'saved'; $('tab-saved').classList.add('active'); $('tab-browser').classList.remove('active'); refreshHistory(); });
  $('search').addEventListener('input', refreshHistory);
  $('clear-all').addEventListener('click', async () => {
    if (!confirm(`Clear all ${state.activeStore === 'saved' ? 'saved' : 'browser'} sessions?`)) return;
    await DB.clearStore(state.activeStore);
    state.session = null; $('result').classList.add('hidden');
    refreshHistory();
  });
  $('toggle-sidebar').addEventListener('click', () => {
    document.getElementById('app').classList.toggle('collapsed');
    document.getElementById('app').classList.toggle('show-sidebar');
  });
}

// ---------------- utils ----------------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------- init ----------------
function init() {
  initAuth();
  initInputTabs();
  initToolbar();
  initHistory();
  $('transcribe-btn').addEventListener('click', runTranscribe);
  $('model-select').addEventListener('change', () => { $('foot-model').textContent = $('model-select').selectedOptions[0].text; });
}
init();
