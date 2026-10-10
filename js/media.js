// Media helpers: fetch/validate media, decode audio to 16kHz mono Float32Array.

export const WHISPER_SR = 16000;

export function isYouTube(url) {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts)/i.test(url);
}

export function isPageLike(url) {
  // Reject obvious HTML pages (no media extension, known video sites).
  if (isYouTube(url)) return true;
  if (/(?:vimeo\.com|tiktok\.com|instagram\.com|facebook\.com|twitter\.com|x\.com)\//i.test(url)) return true;
  return false;
}

export const YOUTUBE_MESSAGE =
  "youtube.com links are web pages, not media files, so they can't be transcribed directly. " +
  'Download the video and use Upload instead, or paste a direct link to an audio/video file ' +
  '(e.g. ending in .mp3, .mp4, .wav).';

// Fetch a direct media URL into a Blob. Throws a friendly error on CORS/network issues.
export async function fetchMedia(url, onProgress) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error(
      'Could not fetch that URL. The server may block cross-origin requests (CORS). ' +
      'Try downloading the file and using Upload instead.'
    );
  }
  if (!resp.ok) throw new Error(`Request failed (${resp.status} ${resp.statusText}).`);

  const ct = resp.headers.get('content-type') || '';
  if (/text\/html/i.test(ct)) {
    throw new Error('That link returned a web page, not a media file. Paste a direct media URL or upload a file.');
  }

  const total = Number(resp.headers.get('content-length')) || 0;
  if (!resp.body || !total) {
    const blob = await resp.blob();
    return blob;
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress && total) onProgress(received / total);
  }
  return new Blob(chunks, { type: ct });
}

// Decode any audio/video Blob into mono Float32Array @ 16kHz for Whisper.
export async function decodeToMono16k(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (e) {
    ctx.close();
    throw new Error('Could not decode audio from this file. The format may be unsupported by this browser.');
  }
  const duration = audioBuffer.duration;
  const length = Math.max(1, Math.ceil(duration * WHISPER_SR));
  const offline = new OfflineAudioContext(1, length, WHISPER_SR);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const data = rendered.getChannelData(0).slice(); // copy out
  ctx.close();
  return { pcm: data, duration };
}

export function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
