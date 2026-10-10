# VidToText

Drop in a video or audio file, or paste a direct media link, and get a timestamped
transcript — **everything runs in your browser. Nothing is uploaded.**

Transcription uses [Whisper](https://github.com/openai/whisper) via
[transformers.js](https://github.com/huggingface/transformers.js). Summarization,
speaker diarization and translation all run on-device too.

## Run it

No build step. Serve the folder over HTTP (ES modules + Web Workers need `http://`,
not `file://`):

```bash
npm start          # → http://localhost:5173
# or: python3 -m http.server 5173
# or: npx serve
```

Open the URL, enter any email to create a local profile, and start transcribing.

> First transcription downloads the Whisper model (~40–150 MB depending on the model
> size) from the Hugging Face CDN and caches it in your browser. After that it works
> offline. A browser with **WebGPU** (recent Chrome/Edge) is much faster; otherwise it
> falls back to WASM.

## Features

| Feature | How it works |
|---|---|
| **Transcribe** | Whisper (tiny / base / small) in a Web Worker. Timestamped segments; click a line to seek the video. |
| **AI Summarize** | Chrome's on-device Summarizer API when available, otherwise a built-in extractive summarizer. Always works, never uploads. |
| **Speaker Diarization** | Per-segment pitch + energy features clustered with k-means to label *Speaker 1…N*. Pure on-device signal processing. |
| **Translate** | Chrome's on-device Translator API when available, otherwise Helsinki-NLP opus-mt models via transformers.js. 10 target languages. |
| **History** | Saved to IndexedDB in your browser (`This browser` + `Saved` tabs, search, clear). |
| **Export** | Copy, Download `.txt`, or Save to the local database. |

## What was fixed

The earlier build threw **"Summarization failed"** and **"Speaker detection failed"**
toasts because those features depended on a backend that wasn't reachable. They are now
implemented to run entirely on-device, so they succeed without any server:

- **Summarize** uses the built-in browser AI when present and a reliable extractive
  fallback otherwise — it can't fail for lack of a server.
- **Speaker diarization** was rewritten as on-device clustering (the k-means had an
  init bug that collapsed everyone into one speaker; it now uses corrected k-means++
  with multiple restarts).
- **Translate** uses the on-device Translator API or opus-mt models, with timeouts so a
  missing/stalled built-in model falls back instead of hanging.
- URL input now accepts **YouTube links**: the audio is pulled in-browser through
  public extractors (Invidious/Piped instances, tried with fallbacks) and transcribed
  on-device. Other non-media web pages (Vimeo/TikTok/etc.) still get a clear message.
  Note: for YouTube, the audio passes through a public extractor instance; the
  transcription itself is still on-device. If every instance is down, download the
  video and use Upload.

## Project layout

```
index.html            UI
css/styles.css         styling
serve.mjs              zero-dependency static server
js/
  app.js               main controller (auth, flow, history, rendering)
  transcribe.js        Whisper worker controller
  whisper-worker.js    Web Worker running transformers.js Whisper
  summarize.js         on-device summarization
  diarize.js           on-device speaker diarization
  translate.js         on-device translation
  media.js             fetch/decode/resample audio helpers
  db.js                IndexedDB history store
```

## Privacy

Media is decoded and transcribed locally. The only network requests are the one-time
model downloads from the Hugging Face CDN (cached afterwards). The sign-in is a local
profile stored in your browser — there is no account server.
