// Main-thread controller for the Whisper worker.
let worker = null;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

async function detectDevice() {
  // WebGPU and multi-threaded WASM both need a helper Worker spawned from the
  // transformers.js CDN script. Browsers forbid constructing a Worker from a
  // cross-origin URL, so on a static host (GitHub Pages) that throws
  // "Failed to construct 'Worker' … cannot be accessed from origin" and no
  // backend initializes. Single-threaded WASM loads without any worker, so it
  // is the reliable choice here.
  return 'wasm';
}

// pcm: Float32Array @16k. Returns { text, chunks:[{start,end,text}] }.
export async function transcribe(pcm, model, { onStatus, onProgress } = {}) {
  const device = await detectDevice();
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const handle = (e) => {
      const d = e.data;
      if (d.type === 'status') onStatus?.(d.message);
      else if (d.type === 'progress') onProgress?.(d);
      else if (d.type === 'done') { cleanup(); resolve({ text: d.text, chunks: d.chunks, device }); }
      else if (d.type === 'error') { cleanup(); reject(new Error(d.message)); }
    };
    const onErr = (err) => { cleanup(); reject(new Error(err.message || 'Worker error')); };
    const cleanup = () => { w.removeEventListener('message', handle); w.removeEventListener('error', onErr); };
    w.addEventListener('message', handle);
    w.addEventListener('error', onErr);
    // Transfer the PCM buffer to avoid a copy.
    w.postMessage({ type: 'transcribe', pcm, model, device }, [pcm.buffer]);
  });
}
