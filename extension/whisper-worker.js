// Whisper worker — loads transformers.js and runs speech-to-text off the main
// thread. Audio arrives as a Float32Array at 16 kHz (decoded on the page), and
// transcribed text is posted back, streaming as it's produced.

import { pipeline, env } from "./vendor/transformers.min.js";

// Load the ONNX runtime WASM from our bundled copy (never from the internet —
// Chrome extensions may not load remote code), and let model *data* download
// from the Hugging Face Hub on first use (cached by the browser afterwards).
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.backends.onnx.wasm.wasmPaths = new URL("./vendor/", import.meta.url).href;
// Single-threaded: robust everywhere (no SharedArrayBuffer / cross-origin
// isolation needed). Slower than multi-thread, but it just works.
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;
let loadedModel = null;

async function getTranscriber(model, onProgress) {
  if (transcriber && loadedModel === model) return transcriber;
  if (transcriber) {
    try {
      await transcriber.dispose();
    } catch (_) {}
    transcriber = null;
  }
  transcriber = await pipeline("automatic-speech-recognition", model, {
    progress_callback: onProgress,
    dtype: "q8", // 8-bit quantized: smaller download, faster on CPU/WASM
    device: "wasm",
  });
  loadedModel = model;
  return transcriber;
}

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === "transcribe") {
    const { audio, model, language } = e.data;
    try {
      const asr = await getTranscriber(model, (p) => {
        // p: {status, file, progress, loaded, total}
        self.postMessage({ type: "progress", payload: p });
      });

      self.postMessage({ type: "status", payload: "Transcribing…" });

      const isEnglishOnly = /\.en$/.test(model);
      const options = {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      };
      if (!isEnglishOnly) {
        options.language = language && language !== "auto" ? language : null;
        options.task = "transcribe";
      }

      // Stream partial text as chunks complete.
      options.chunk_callback = (chunk) => {
        self.postMessage({ type: "partial", payload: chunk });
      };

      const output = await asr(audio, options);
      const text = (output && output.text ? output.text : "").trim();
      self.postMessage({ type: "done", payload: { text } });
    } catch (err) {
      self.postMessage({ type: "error", payload: String(err && err.message ? err.message : err) });
    }
  }
};
