/* The1Min popup/panel renderer */
const BUDDY = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <line class="ant" x1="50" y1="24" x2="50" y2="13"/><circle class="bulb" cx="50" cy="10" r="4.5"/>
  <rect class="head" x="18" y="22" width="64" height="62" rx="16"/>
  <circle class="eye" cx="39" cy="50" r="5"/><circle class="eye" cx="61" cy="50" r="5"/>
  <path class="mouth" d="M 40 68 Q 50 77 60 68"/></svg>`;
document.querySelectorAll('.buddy').forEach(b => b.innerHTML = BUDDY);

const isAuto = new URLSearchParams(location.search).get('mode') === 'auto';
const views = ['home', 'think', 'result', 'settings', 'error'];
function view(n) { views.forEach(v => document.getElementById('v-' + v).classList.toggle('hidden', v !== n)); }

let lastB64 = null;   // remember the capture so "dig deeper" can re-ask (popup mode)

/* ---------- render a result ---------- */
function renderResult(r) {
  document.getElementById('rProblem').textContent = r.problem;
  const ol = document.getElementById('rSteps'); ol.innerHTML = '';
  (r.steps || []).forEach(s => { const li = document.createElement('li'); const sp = document.createElement('span'); sp.textContent = s; li.appendChild(sp); ol.appendChild(li); });
  document.getElementById('rResource').textContent = r.resource;
  document.getElementById('rPrompt').textContent = r.prompt;
  document.getElementById('rCheer').textContent = '“' + r.cheer + '”';
  document.getElementById('deeper').style.display = isAuto ? 'none' : '';  // can't re-capture the real tab from the auto window
  view('result');
}

/* ---------- the main flow (popup mode) ---------- */
async function readScreen(note) {
  const cfg = await self.t1mGetConfig();
  if (!cfg.apiKey) { view('settings'); return; }
  document.getElementById('thinkNote').textContent = note ? 'Trying a different angle this time.' : 'Working out the clearest next step.';
  view('think');
  try {
    if (!note || !lastB64) lastB64 = await self.t1mCapture();   // active tab of this window
    const data = await self.t1mAsk(lastB64, note || '', cfg);
    renderResult(data);
  } catch (e) {
    showError(e);
  }
}

function showError(e) {
  let msg = (e && e.message) || 'Something went wrong.';
  if (/cannot be scripted|chrome:\/\/|Cannot access|activeTab|extension gallery|No tab/i.test(msg) || e.status === undefined && /capture/i.test(msg)) {
    msg = 'I can only read normal web pages. Switch to your work tab (not a Chrome settings page) and try again.';
  } else if (e.status === 401) {
    msg = 'That API key didn\'t work. Open Settings and paste it again.';
  } else if (e.status === 429) {
    msg = 'Too many requests right now — wait a few seconds and try again.';
  }
  document.getElementById('errMsg').textContent = msg;
  view('error');
}

/* ---------- boot ---------- */
(async function boot() {
  const cfg = await self.t1mGetConfig();
  document.getElementById('watch').checked = cfg.watch;
  document.getElementById('key').value = cfg.apiKey;
  document.getElementById('model').value = cfg.model;

  if (isAuto) {
    // Opened by the watcher: show whatever the service worker stored.
    chrome.storage.session.get('current', ({ current }) => {
      if (!current) { view('home'); return; }
      if (current.kind === 'result') renderResult(current.data);
      else if (current.kind === 'thinking') view('think');
      else if (current.kind === 'error') { document.getElementById('errMsg').textContent = current.message || 'Something went wrong.'; view('error'); }
      else view('home');
    });
    return;
  }
  if (!cfg.apiKey) view('settings');
  else view('home');
})();

/* ---------- wiring ---------- */
document.getElementById('read').addEventListener('click', () => readScreen());
document.getElementById('deeper').addEventListener('click', () => readScreen('That didn\'t help — give a different angle.'));
document.getElementById('done').addEventListener('click', () => { if (isAuto) window.close(); else view('home'); });
document.getElementById('errRetry').addEventListener('click', () => readScreen());
document.getElementById('gear').addEventListener('click', () => view('settings'));
document.getElementById('errSettings').addEventListener('click', () => view('settings'));

document.getElementById('watch').addEventListener('change', (e) => self.t1mSetConfig({ watch: e.target.checked }));

document.getElementById('save').addEventListener('click', async () => {
  await self.t1mSetConfig({ apiKey: document.getElementById('key').value.trim(), model: document.getElementById('model').value });
  view('home');
});

document.getElementById('copyBtn').addEventListener('click', function () {
  const txt = document.getElementById('rPrompt').textContent; const btn = this;
  const done = () => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1400); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(sel); else sel();
  function sel() { const r = document.createRange(); r.selectNodeContents(document.getElementById('rPrompt')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Select + copy'; setTimeout(() => btn.textContent = 'Copy', 1800); }
});
