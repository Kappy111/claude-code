---
title: VidToText Transcribe
emoji: 🎙️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# VidToText transcription server

A tiny FastAPI service that transcribes uploaded audio with
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) on CPU. The
VidToText web app sends it the audio and gets back a timestamped transcript —
so transcription is fast even on low-powered devices like Chromebooks.

## Deploy on Hugging Face Spaces (free, ~5 minutes)

1. Create a free account at https://huggingface.co.
2. Go to **https://huggingface.co/new-space**.
   - **Owner**: you. **Space name**: `vidtotext-transcribe` (anything).
   - **SDK**: choose **Docker** → **Blank**.
   - **Hardware**: *CPU basic* (free). Visibility: Public.
   - Create the Space.
3. On the Space page open the **Files** tab → **Add file → Upload files**, and
   upload these four files from this `server/` folder:
   `app.py`, `requirements.txt`, `Dockerfile`, `README.md`.
   (Keep this `README.md` — its header tells the Space to build with Docker.)
4. The Space builds automatically (first build ~3–5 min). When it says
   **Running**, your server URL is:
   `https://<your-username>-vidtotext-transcribe.hf.space`

## Point the app at it

In the VidToText app, click **"Use a faster server"** under the Transcribe
button and paste that URL. From then on, transcription runs on the server.
(The first request after the Space has been idle wakes it up — give it ~30s.)

## Endpoints

- `GET /` → health check.
- `POST /transcribe?model=tiny|base|small` with multipart field `audio` →
  `{ "text": "...", "language": "en", "chunks": [{ "start", "end", "text" }] }`

## Run locally

```bash
cd server
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 7860
```
