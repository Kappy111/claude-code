# Scribe — turn videos into text

A small, self-hosted web app that converts video (or audio) into text. Paste a
video URL or upload a file; Scribe downloads the audio with
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and transcribes it with a **local**
Whisper model via
[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) — a lightweight
CTranslate2 runtime that's quick on CPU and needs no multi-gigabyte PyTorch
install. The transcript appears on the page, ready to read, copy, or download.

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

The first time you use a model, its weights download automatically from the
Hugging Face Hub (cached in `~/.cache/huggingface` thereafter).

## Run (command line) — simplest, no browser needed

Handy on Chromebooks/WSL where reaching a local web server in the browser can
be fiddly. **Interactive mode** just asks you for links:

```bash
python transcribe.py
# then paste a link (or file path) at the prompt, press Enter, repeat.
# type  q  to quit.
```

Or pass a link/file **directly**:

```bash
python transcribe.py "https://www.youtube.com/watch?v=..."   # a URL
python transcribe.py ~/Downloads/recording.mp3               # or a local file
```

The transcript prints as it's recognized. Each one is saved in `~/transcripts/`
with a timestamped name, and the latest is also at `~/transcript.txt`.
Pick a model with `--model tiny` (fastest) through `--model large-v3` (best).

## Run (web app)

```bash
python app.py
```

Then open <http://127.0.0.1:5000> in your browser.

Set a different port with `PORT=8080 python app.py`, or change the default
Whisper model with `SCRIBE_MODEL=small python app.py`.

## Whisper models

Pick a model in the UI. Larger = more accurate but slower and more memory-hungry.

| Model      | Rough download | Speed (CPU) | Accuracy  |
| ---------- | -------------- | ----------- | --------- |
| `tiny`     | ~75 MB         | fastest     | basic     |
| `base`     | ~145 MB        | fast        | good ✅    |
| `small`    | ~480 MB        | moderate    | better    |
| `medium`   | ~1.5 GB        | slow        | great     |
| `large-v3` | ~3 GB          | slowest     | best      |

`base` is the default and a good starting point. On a modest machine (e.g. a
Chromebook) stick to `tiny` or `base`.

### Running on CPU vs GPU

By default Scribe runs on CPU with 8-bit (`int8`) math — fast and light, no GPU
needed. On a machine with an NVIDIA GPU, speed it up with:

```bash
SCRIBE_DEVICE=cuda SCRIBE_COMPUTE=float16 python app.py
```

## Notes

- Uploaded files and downloaded audio are staged in a temp directory and
  deleted after each job; transcripts are kept in memory only for the life of
  the server process.
- Only download media you have the right to transcribe.
