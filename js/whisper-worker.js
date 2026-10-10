// Web Worker: on-device speech-to-text with Whisper via transformers.js.
// Runs off the main thread so the UI stays responsive during inference.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

// Allow remote model download from the HF hub; cache in the browser.
env.allowLocalModels = false;
env.useBrowserCache = true;

// Single-threaded, no proxy worker. Multi-threading / proxy would make
// onnxruntime spawn a Worker from the cross-origin CDN script, which browsers
// block on a static host ("Failed to construct 'Worker' … cannot be accessed
// from origin"). Single-threaded WASM instantiates without any worker.
try {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
} catch (_) {}

let transcriber = null;
let loadedModel = null;

async function getTranscriber(model, device) {
  if (transcriber && loadedModel === model) return transcriber;
  if (transcriber) {
    try { await transcriber.dispose(); } catch (_) {}
    transcriber = null;
  }
  transcriber = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress') {
        self.postMessage({
          type: 'progress',
          phase: 'download',
          file: p.file,
          loaded: p.loaded,
          total: p.total,
          pct: p.total ? p.loaded / p.total : 0,
        });
      } else if (p.status === 'ready' || p.status === 'done') {
        self.postMessage({ type: 'progress', phase: 'ready' });
      } else if (p.status === 'initiate') {
        self.postMessage({ type: 'progress', phase: 'download', file: p.file, pct: 0 });
      }
    },
  });
  loadedModel = model;
  return transcriber;
}

self.onmessage = async (e) => {
  const { type } = e.data;
  if (type !== 'transcribe') return;

  const { pcm, model, device } = e.data;
  try {
    const dev = device === 'webgpu' ? 'webgpu' : 'wasm';
    self.postMessage({ type: 'status', message: 'Loading model…' });
    const asr = await getTranscriber(model, dev);

    self.postMessage({ type: 'status', message: 'Transcribing locally…' });
    const output = await asr(pcm, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const chunks = (output.chunks || []).map((c) => ({
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? null,
      text: (c.text || '').trim(),
    })).filter((c) => c.text);

    self.postMessage({ type: 'done', text: (output.text || '').trim(), chunks });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
