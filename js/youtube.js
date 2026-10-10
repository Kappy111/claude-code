// Fetch YouTube audio in the browser via public extractors (Invidious / Piped).
// These instances proxy the audio with permissive CORS headers, so the browser
// can download it directly — no backend needed. Transcription still happens
// on-device. Instances go up and down, so we try several and fall back clearly.

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.jing.rocks',
  'https://iv.ggtyler.dev',
  'https://invidious.privacyredirect.com',
];

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaboring.stream',
  'https://pipedapi.leptons.xyz',
];

export function getYouTubeId(url) {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchAudioBlob(u, onProgress, onStatus) {
  onStatus?.('Downloading audio…');
  const resp = await fetch(u, { redirect: 'follow' });
  if (!resp.ok) throw new Error('stream ' + resp.status);
  const ct = resp.headers.get('content-type') || '';
  if (/text\/html|application\/json/i.test(ct)) throw new Error('not media');
  const total = Number(resp.headers.get('content-length')) || 0;
  if (!resp.body) return await resp.blob();
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress?.(received / total);
    else onStatus?.(`Downloading audio… ${(received / 1024 / 1024).toFixed(1)} MB`);
  }
  return new Blob(chunks, { type: ct || 'audio/mp4' });
}

// Returns { blob, title }.
export async function fetchYouTubeAudio(url, { onStatus, onProgress } = {}) {
  const id = getYouTubeId(url);
  if (!id) throw new Error('Could not read a video ID from that YouTube link.');

  // 1) Invidious — latest_version itag 140 is a plain m4a audio track, proxied locally.
  for (const inst of INVIDIOUS) {
    try {
      onStatus?.('Finding audio stream…');
      const streamUrl = `${inst}/latest_version?id=${id}&itag=140&local=true`;
      const blob = await fetchAudioBlob(streamUrl, onProgress, onStatus);
      if (blob && blob.size > 20000) return { blob, title: await titleFromInvidious(inst, id) };
    } catch (_) { /* try next */ }
  }

  // 2) Piped — read /streams, pick an audio-only stream (prefer m4a for decode support).
  for (const inst of PIPED) {
    try {
      onStatus?.('Finding audio stream…');
      const r = await fetch(`${inst}/streams/${id}`);
      if (!r.ok) continue;
      const data = await r.json();
      const audio = (data.audioStreams || []).filter(s => s.url);
      if (!audio.length) continue;
      audio.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0)); // smallest first = fastest
      const pick = audio.find(s => /mp4|m4a|mp4a/i.test((s.mimeType || '') + (s.format || ''))) || audio[0];
      const blob = await fetchAudioBlob(pick.url, onProgress, onStatus);
      if (blob && blob.size > 20000) return { blob, title: data.title || id };
    } catch (_) { /* try next */ }
  }

  throw new Error(
    'Could not fetch this YouTube video right now — the public extractors may be down or the video is age/region restricted. ' +
    'Try again in a moment, or download the video and use Upload.'
  );
}

async function titleFromInvidious(inst, id) {
  try {
    const r = await fetch(`${inst}/api/v1/videos/${id}?fields=title`);
    if (r.ok) { const j = await r.json(); return j.title || id; }
  } catch (_) {}
  return id;
}
