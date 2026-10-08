# Scribe — turn videos into text

A small, self-hosted web app that converts video (or audio) into text. Paste a
video URL or upload a file; Scribe downloads the audio with
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and transcribes it with a **local**
[Whisper](https://github.com/openai/whisper) model. The transcript appears on
the page, ready to read, copy, or download.

Everything runs on your own machine — no audio or transcript is ever sent to a
third-party service.

## How it works

```
URL ──▶ yt-dlp ──▶ audio.mp3 ─┐
                              ├──▶ local Whisper ──▶ text ──▶ browser
upload (video/audio) ─────────┘
```

A browser page posts a URL or file to the Flask backend, which runs the
download + transcription in a background thread. The page polls for progress
and shows the finished text.

## Requirements

- **Python 3.9+**
- **ffmpeg** on your `PATH` (required by both yt-dlp and Whisper)
  - macOS: `brew install ffmpeg`
  - Debian/Ubuntu: `sudo apt install ffmpeg`
  - Windows: download from <https://ffmpeg.org> and add to `PATH`

## Setup

```bash
# 1. (optional) create a virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. install dependencies
pip install -r requirements.txt
```

The first transcription downloads the chosen Whisper model weights (cached in
`~/.cache/whisper` thereafter).

## Run

```bash
python app.py
```

Then open <http://127.0.0.1:5000> in your browser.

Set a different port with `PORT=8080 python app.py`, or change the default
Whisper model with `SCRIBE_MODEL=small python app.py`.

## Whisper models

Pick a model in the UI. Larger = more accurate but slower and more memory-hungry.

| Model    | Rough size | Speed      | Accuracy  |
| -------- | ---------- | ---------- | --------- |
| `tiny`   | ~75 MB     | fastest    | basic     |
| `base`   | ~150 MB    | fast       | good ✅    |
| `small`  | ~500 MB    | moderate   | better    |
| `medium` | ~1.5 GB    | slow       | great     |
| `large`  | ~3 GB      | slowest    | best      |

`base` is the default and a good starting point. A GPU is used automatically if
PyTorch detects one, otherwise it runs on CPU.

## Notes

- Uploaded files and downloaded audio are staged in a temp directory and
  deleted after each job; transcripts are kept in memory only for the life of
  the server process.
- Only download media you have the right to transcribe.
