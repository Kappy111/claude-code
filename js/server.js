// Optional server-side transcription. When a server URL is configured, the
// browser uploads the audio and the server (faster-whisper) returns the
// transcript — fast even on low-powered devices.

const KEY = 'vidtotext.server';

export function getServerUrl() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function setServerUrl(u) {
  try {
    if (u) localStorage.setItem(KEY, u.replace(/\/+$/, ''));
    else localStorage.removeItem(KEY);
  } catch {}
}

function modelSize(model) {
  const s = (model || '').split('/').pop().replace('whisper-', '').replace('.en', '');
  return ['tiny', 'base', 'small', 'medium'].includes(s) ? s : 'base';
}

// Returns { text, chunks, device:'server', language }.
export async function transcribeOnServer(blob, model, serverUrl, { onStatus } = {}) {
  const base = serverUrl.replace(/\/+$/, '');
  const fd = new FormData();
  fd.append('audio', blob, 'audio.bin');
  onStatus?.('Uploading to server…');
  let resp;
  try {
    resp = await fetch(`${base}/transcribe?model=${encodeURIComponent(modelSize(model))}`, {
      method: 'POST',
      body: fd,
    });
  } catch (e) {
    throw new Error('Could not reach the transcription server. Check the URL, and give it ~30s to wake up if it was idle.');
  }
  if (!resp.ok) throw new Error(`Transcription server returned ${resp.status}. Is the URL correct and the Space running?`);
  const data = await resp.json();
  const chunks = (data.chunks || [])
    .map(c => ({ start: c.start, end: c.end, text: (c.text || '').trim() }))
    .filter(c => c.text);
  return {
    text: data.text || chunks.map(c => c.text).join(' '),
    chunks,
    device: 'server',
    language: (data.language || 'AUTO').toUpperCase(),
  };
}
