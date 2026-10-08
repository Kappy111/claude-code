# Scribe — Chrome extension (video & audio → text)

Transcribes **audio/video files** you pick, or the **audio playing in your
current tab** (e.g. a YouTube video), entirely inside the browser using a
WebAssembly build of Whisper. Nothing is uploaded — the audio never leaves your
computer. The Whisper model downloads once from the Hugging Face Hub and is then
cached by the browser.

## Install it in your own Chrome (no Web Store needed)

1. Go to **chrome://extensions**
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Choose this **`extension`** folder.
   - On a Chromebook: the folder lives under **Files app → "Linux files" →
     claude-code → extension**.
5. The Scribe icon appears in your toolbar (click the puzzle-piece to pin it).

## Use it

Click the Scribe icon, then:

- **Transcribe this tab's audio** — records what's playing in your current tab,
  then transcribes it. Click **Stop & transcribe** when you've captured enough.
  (The tab may go silent while recording — that's expected.)
- **Transcribe a file** — opens the Scribe page; drop in or choose an audio/video
  file (`.mp3`, `.m4a`, `.wav`, `.webm`, and many `.mp4`).

The first transcription downloads the chosen model once (tiny ≈ tens of MB).
Pick a bigger model in the dropdown for more accuracy (slower).

## Publishing to the Chrome Web Store (optional)

1. Create a developer account at the Chrome Web Store Developer Dashboard
   (one-time **$5** fee).
2. Zip the **contents** of this `extension` folder (so `manifest.json` is at the
   top level of the zip).
3. Upload the zip, fill in the listing (name, description, screenshots, privacy),
   and submit for review.

## Notes / limitations

- No pasting YouTube URLs: browsers can't download YouTube audio the way the
  command-line `yt-dlp` tool can. Use **"transcribe this tab"** on a playing
  video instead, or transcribe a file you already have.
- Runs the model single-threaded on WASM for maximum compatibility, so long
  recordings take a while. A machine with WebGPU would be much faster (a future
  enhancement).
