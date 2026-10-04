// Hidden worker: records microphone audio and transcribes it locally with
// Whisper via Transformers.js (ONNX Runtime Web / WASM). No cloud, no API keys.

import {
  pipeline,
  env,
} from '../node_modules/@huggingface/transformers/dist/transformers.min.js';

const api = window.voiceAPI;

// Transformers.js configuration. Models are downloaded once from the Hugging
// Face Hub and then cached locally by the browser engine (Electron's cache
// lives in the app's userData dir), so subsequent runs are fully offline.
env.allowLocalModels = false;
env.useBrowserCache = true;

let settings = null;
let transcriber = null;
let loadingModel = null; // Promise guard so we don't load twice.
let loadedModelId = null;

let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recording = false;

// ---------------------------------------------------------------------------
// Sounds (Web Audio) — a rising beep to start, a falling beep to stop.
// ---------------------------------------------------------------------------
let audioCtx = null;
function beep(startFreq, endFreq, durationMs) {
  if (!settings || !settings.sounds) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    const dur = durationMs / 1000;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur);
  } catch (e) {
    /* non-fatal */
  }
}
const startBeep = () => beep(520, 880, 160);
const stopBeep = () => beep(660, 330, 180);

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------
async function ensureModel() {
  const wanted = settings.model;
  if (transcriber && loadedModelId === wanted) return transcriber;
  if (loadingModel) return loadingModel;

  api.sendModelStatus({ ready: false, message: `Loading ${wanted}…`, progress: 0 });

  loadingModel = pipeline('automatic-speech-recognition', wanted, {
    // Prefer quantized weights for a small, fast download.
    dtype: 'q8',
    progress_callback: (p) => {
      if (p && typeof p.progress === 'number') {
        api.sendModelStatus({
          ready: false,
          message: `Downloading ${p.file || 'model'}…`,
          progress: Math.round(p.progress),
        });
      }
    },
  })
    .then((t) => {
      transcriber = t;
      loadedModelId = wanted;
      loadingModel = null;
      api.sendModelStatus({ ready: true, message: 'Model ready', progress: 100 });
      return t;
    })
    .catch((err) => {
      loadingModel = null;
      api.sendModelStatus({ ready: false, message: 'Model failed to load', progress: 0 });
      api.reportError('Could not load the transcription model: ' + err.message);
      throw err;
    });

  return loadingModel;
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

// Decode a recorded Blob and resample to 16kHz mono Float32Array, which is
// what Whisper expects.
async function blobToPcm16k(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(arrayBuf);
  decodeCtx.close();

  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
async function startRecording() {
  if (recording) return;

  // Kick off model loading in parallel with recording so it's ready by the time
  // the user stops talking.
  ensureModel().catch(() => {});

  const constraints = {
    audio: settings.micDeviceId
      ? { deviceId: { exact: settings.micDeviceId } }
      : true,
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    api.reportError(
      'Microphone access failed. Grant microphone permission to Voice Typer. (' +
        err.message +
        ')'
    );
    return;
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = onRecordingStopped;
  mediaRecorder.start();

  recording = true;
  startBeep();
  api.setRecordingState(true);
}

function stopRecording() {
  if (!recording || !mediaRecorder) return;
  recording = false;
  stopBeep();
  api.setRecordingState(false);
  try {
    mediaRecorder.stop();
  } catch (_e) {
    /* ignore */
  }
}

async function onRecordingStopped() {
  // Release the microphone.
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  chunks = [];
  if (!blob.size) return;

  api.sendModelStatus({ ready: loadedModelId != null, message: 'Transcribing…', transcribing: true });

  try {
    const pcm = await blobToPcm16k(blob);
    const model = await ensureModel();

    const options = {
      chunk_length_s: 30,
      stride_length_s: 5,
    };
    // Multilingual models accept a language + task; the .en models do not.
    const isEnglishOnly = /\.en$/.test(settings.model);
    if (!isEnglishOnly && settings.language && settings.language !== 'auto') {
      options.language = settings.language;
      options.task = 'transcribe';
    }

    const result = await model(pcm, options);
    const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text;
    api.sendModelStatus({ ready: true, message: 'Model ready', transcribing: false });
    api.sendTranscription(text || '');
  } catch (err) {
    api.sendModelStatus({ ready: true, message: 'Model ready', transcribing: false });
    api.reportError('Transcription failed: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Microphone enumeration (used by the settings window).
// ---------------------------------------------------------------------------
window.__listMics = async function () {
  try {
    // Need permission once for labels to be populated.
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
    tmp.getTracks().forEach((t) => t.stop());
  } catch (_e) {
    /* labels may be blank without permission */
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));
};

// ---------------------------------------------------------------------------
// IPC wiring
// ---------------------------------------------------------------------------
api.onSettingsUpdated((s) => {
  const modelChanged = settings && s.model !== settings.model;
  settings = s;
  if (modelChanged) {
    transcriber = null;
    loadedModelId = null;
  }
  // Warm up the model shortly after launch / settings change.
  ensureModel().catch(() => {});
});

api.onToggleRecording(() => {
  if (recording) stopRecording();
  else startRecording();
});
