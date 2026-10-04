// Offscreen document: records the microphone and transcribes with Whisper via
// Transformers.js — all locally, no network except the one-time model download.
//
// Transformers.js (~0.9 MB) is imported lazily the first time we need it so the
// message listener below is registered immediately when this document loads,
// avoiding a race where the first "toggle" message arrives before we're ready.

let pipeline = null;
let env = null;

async function loadTransformers() {
  if (pipeline) return;
  const mod = await import('./lib/transformers.min.js');
  pipeline = mod.pipeline;
  env = mod.env;
  // Load the ONNX Runtime WASM that ships inside the extension (no CDN).
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/');
}

let settings = null;
let transcriber = null;
let loadedKey = null; // model id + device, so we reload when either changes.
let loadingPromise = null;

let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recording = false;

function toBackground(msg) {
  chrome.runtime.sendMessage({ target: 'background', ...msg });
}
function toPopup(msg) {
  chrome.runtime.sendMessage({ target: 'popup', ...msg });
}

// ---------------------------------------------------------------------------
// Beeps
// ---------------------------------------------------------------------------
let audioCtx = null;
function beep(fromHz, toHz, ms) {
  if (!settings || !settings.sounds) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const dur = ms / 1000;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fromHz, t0);
    osc.frequency.exponentialRampToValueAtTime(toHz, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch (_e) {
    /* non-fatal */
  }
}
const startBeep = () => beep(520, 880, 160);
const stopBeep = () => beep(660, 330, 180);

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
function webgpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function ensureModel() {
  const useGpu = settings.preferGpu && webgpuAvailable();
  const key = settings.model + (useGpu ? '|webgpu' : '|wasm');
  if (transcriber && loadedKey === key) return transcriber;
  if (loadingPromise) return loadingPromise;

  toPopup({ type: 'model-status', ready: false, message: `Loading ${settings.model}…`, progress: 0 });
  await loadTransformers();

  const build = (device, dtype) =>
    pipeline('automatic-speech-recognition', settings.model, {
      device,
      dtype,
      progress_callback: (p) => {
        if (p && typeof p.progress === 'number') {
          toPopup({
            type: 'model-status',
            ready: false,
            message: `Downloading ${p.file || 'model'}…`,
            progress: Math.round(p.progress),
          });
        }
      },
    });

  loadingPromise = (async () => {
    try {
      const t = useGpu ? await build('webgpu', 'fp32') : await build('wasm', 'q8');
      transcriber = t;
      loadedKey = key;
      toPopup({ type: 'model-status', ready: true, message: 'Model ready', progress: 100 });
      return t;
    } catch (err) {
      // Fall back from WebGPU to WASM if GPU init failed.
      if (useGpu) {
        try {
          const t = await build('wasm', 'q8');
          transcriber = t;
          loadedKey = settings.model + '|wasm';
          toPopup({ type: 'model-status', ready: true, message: 'Model ready (CPU)', progress: 100 });
          return t;
        } catch (err2) {
          err = err2;
        }
      }
      toPopup({ type: 'model-status', ready: false, message: 'Model failed to load', progress: 0 });
      toPopup({ type: 'notice', message: 'Could not load the model: ' + err.message });
      throw err;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

// ---------------------------------------------------------------------------
// Audio: decode recorded blob → 16kHz mono Float32Array for Whisper.
// ---------------------------------------------------------------------------
async function blobToPcm16k(blob) {
  const buf = await blob.arrayBuffer();
  const dec = new AudioContext();
  const decoded = await dec.decodeAudioData(buf);
  dec.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
async function startRecording() {
  if (recording) return;
  ensureModel().catch(() => {}); // warm up in parallel

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true,
    });
  } catch (err) {
    toPopup({
      type: 'notice',
      message:
        'Microphone access failed. Open the extension and click “Enable microphone”. (' +
        err.message +
        ')',
    });
    toBackground({ type: 'error' });
    return;
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e) => e.data && e.data.size > 0 && chunks.push(e.data);
  mediaRecorder.onstop = onStopped;
  mediaRecorder.start();

  recording = true;
  startBeep();
  toBackground({ type: 'state', recording: true });
  toPopup({ type: 'state', recording: true });
}

function stopRecording() {
  if (!recording || !mediaRecorder) return;
  recording = false;
  stopBeep();
  toBackground({ type: 'state', recording: false });
  toPopup({ type: 'state', recording: false });
  try {
    mediaRecorder.stop();
  } catch (_e) {
    /* ignore */
  }
}

async function onStopped() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  const blob = new Blob(chunks, { type: (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm' });
  chunks = [];
  if (!blob.size) return;

  toBackground({ type: 'transcribing' });
  toPopup({ type: 'model-status', transcribing: true, message: 'Transcribing…' });

  try {
    const pcm = await blobToPcm16k(blob);
    const model = await ensureModel();

    const options = { chunk_length_s: 30, stride_length_s: 5 };
    const isEnglishOnly = /\.en$/.test(settings.model);
    if (!isEnglishOnly && settings.language && settings.language !== 'auto') {
      options.language = settings.language;
      options.task = 'transcribe';
    }

    const result = await model(pcm, options);
    const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text;
    toPopup({ type: 'model-status', ready: true, transcribing: false, message: 'Model ready' });
    toBackground({ type: 'transcription', text: text || '' });
  } catch (err) {
    toPopup({ type: 'model-status', ready: true, transcribing: false, message: 'Model ready' });
    toPopup({ type: 'notice', message: 'Transcription failed: ' + err.message });
    toBackground({ type: 'error' });
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'ping') {
    sendResponse({ ready: true });
    return; // synchronous response
  }
  if (msg.type === 'toggle') {
    settings = msg.settings;
    if (recording) stopRecording();
    else startRecording();
  } else if (msg.type === 'warm') {
    settings = msg.settings;
    ensureModel().catch(() => {});
  }
});
