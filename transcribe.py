#!/usr/bin/env python3
"""
Scribe CLI — turn a video/audio URL or file into text, printed in the terminal.

Two ways to use it:

  Interactive (friendliest): run with no link, then paste links when asked.
      python transcribe.py

  One-shot: pass a link or file path directly.
      python transcribe.py "https://www.youtube.com/watch?v=..."
      python transcribe.py ~/Downloads/recording.mp3

It downloads the audio with yt-dlp (for URLs) or reads your local file, then
transcribes it with a local faster-whisper model. The text prints to the
terminal as it's recognized and is saved to a file you can open.

Everything runs locally — no audio or transcript leaves this machine.
"""

import argparse
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime

# Strips ANSI / bracketed-paste escape codes (e.g. the ^[[200~ some terminals
# leak when you paste) so a pasted link comes through clean.
_ANSI = re.compile(r"\x1b\[[0-9;]*[~A-Za-z]")


def clean(s: str) -> str:
    return _ANSI.sub("", s).strip().strip('"').strip("'").strip()


def is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def safe_filename(name: str) -> str:
    name = re.sub(r"[^\w\s-]", "", name).strip()
    name = re.sub(r"\s+", "_", name)
    return name[:60] or "transcript"


def download_audio(url: str, workdir: str):
    """Download the audio track of `url` with yt-dlp. Returns (path, title)."""
    import yt_dlp

    outtmpl = os.path.join(workdir, "audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "0",
            }
        ],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "audio")

    mp3 = os.path.join(workdir, "audio.mp3")
    if os.path.exists(mp3):
        return mp3, title
    for name in os.listdir(workdir):
        if name.startswith("audio."):
            return os.path.join(workdir, name), title
    raise RuntimeError("Could not locate the downloaded audio file.")


def transcribe_one(model, source: str) -> bool:
    """Download/locate audio for `source`, transcribe, print, and save."""
    workdir = None
    try:
        if is_url(source):
            workdir = tempfile.mkdtemp(prefix="scribe-")
            print(f"\nDownloading audio from: {source}")
            audio_path, title = download_audio(source, workdir)
            print(f"  Title: {title}")
        else:
            audio_path = os.path.expanduser(source)
            if not os.path.exists(audio_path):
                print(f"  ⚠ File not found: {audio_path}")
                return False
            title = os.path.splitext(os.path.basename(audio_path))[0]

        print("\nTranscribing — text appears below as it's recognized:\n")
        print("-" * 60)
        segments, info = model.transcribe(audio_path, beam_size=5)
        lang = getattr(info, "language", "") or "?"

        parts = []
        for seg in segments:
            text = seg.text.strip()
            if text:
                print(text)
            parts.append(seg.text)
        full = "".join(parts).strip()
        print("-" * 60)

        if not full:
            print("\n⚠ No speech was detected in the audio.")
            return False

        # Save a uniquely named copy (so earlier ones aren't lost) plus a
        # convenient "latest" at ~/transcript.txt.
        outdir = os.path.expanduser("~/transcripts")
        os.makedirs(outdir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        out = os.path.join(outdir, f"{stamp}_{safe_filename(title)}.txt")
        for path in (out, os.path.expanduser("~/transcript.txt")):
            with open(path, "w", encoding="utf-8") as f:
                f.write(full + "\n")

        print(f"\n✅ Done (language: {lang}). Saved to:\n  {out}")
        print("   (also at ~/transcript.txt — open via Files app → 'Linux files')")
        return True
    except Exception as exc:  # noqa: BLE001 - keep the session alive on errors
        print(f"\n⚠ Something went wrong: {exc}")
        return False
    finally:
        if workdir and os.path.isdir(workdir):
            shutil.rmtree(workdir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(
        description="Turn a video/audio URL or file into text (local Whisper)."
    )
    parser.add_argument(
        "source",
        nargs="?",
        default=None,
        help="A video/audio URL or file path. Omit it to be asked interactively.",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("SCRIBE_MODEL", "base"),
        help="Whisper model: tiny, base, small, medium, large-v3 (default: base)",
    )
    parser.add_argument("--device", default=os.environ.get("SCRIBE_DEVICE", "cpu"))
    parser.add_argument("--compute", default=os.environ.get("SCRIBE_COMPUTE", "int8"))
    args = parser.parse_args()

    from faster_whisper import WhisperModel

    print(f"Loading Whisper model '{args.model}' (first use downloads it)…")
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute)

    # One-shot mode: a link/path was given on the command line.
    if args.source:
        transcribe_one(model, clean(args.source))
        return

    # Interactive mode: ask for links until the user quits.
    print("\n" + "=" * 60)
    print("  Scribe is ready.")
    print("  Paste a video/audio link (or a file path) and press Enter.")
    print("  Type  q  and press Enter to quit.")
    print("=" * 60)
    while True:
        try:
            raw = input("\n🎬  Link or file > ")
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break
        source = clean(raw)
        if source.lower() in ("q", "quit", "exit", ""):
            print("Bye!")
            break
        transcribe_one(model, source)


if __name__ == "__main__":
    main()
