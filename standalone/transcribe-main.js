// Standalone (single-file) transcription: runs Whisper on the main thread so
// the app works even when opened directly from a file, with no Web Worker.
let transcriber = null;
let loadedModel = null;

export async function transcribe(pcm, model, { onStatus, onProgress } = {}) {
  onStatus?.('Loading model…');
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  try { env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false; } catch (_) {}

  if (!(transcriber && loadedModel === model)) {
    if (transcriber) { try { await transcriber.dispose(); } catch (_) {} transcriber = null; }
    transcriber = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress') onProgress?.({ phase: 'download', pct: p.total ? p.loaded / p.total : 0 });
        else if (p.status === 'ready' || p.status === 'done') onProgress?.({ phase: 'ready' });
        else if (p.status === 'initiate') onProgress?.({ phase: 'download', pct: 0 });
      },
    });
    loadedModel = model;
  }

  onStatus?.('Transcribing locally…');
  const output = await transcriber(pcm, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
  const chunks = (output.chunks || [])
    .map((c) => ({ start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? null, text: (c.text || '').trim() }))
    .filter((c) => c.text);
  return { text: (output.text || '').trim(), chunks, device: 'wasm' };
}
