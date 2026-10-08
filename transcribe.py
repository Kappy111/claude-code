#!/usr/bin/env python3
"""
Scribe CLI — turn a video/audio URL or file into text, printed in the terminal.

Usage:
    python transcribe.py "https://www.youtube.com/watch?v=..."
    python transcribe.py ~/Downloads/recording.mp3
    python transcribe.py <source> --model tiny

It downloads the audio with yt-dlp (for URLs) or reads your local file, then
transcribes it with a local faster-whisper model. The text is printed to the
terminal as it's recognized and also saved to a .txt file you can open.

Everything runs locally — no audio or transcript leaves this machine.
"""

import argparse
import os
import shutil
import sys
import tempfile


def is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


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


def main():
    parser = argparse.ArgumentParser(
        description="Turn a video/audio URL or file into text (local Whisper)."
    )
    parser.add_argument(
        "source", help="A video/audio URL, or a path to a local file"
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("SCRIBE_MODEL", "base"),
        help="Whisper model: tiny, base, small, medium, large-v3 (default: base)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Where to save the transcript (default: ~/transcript.txt)",
    )
    parser.add_argument("--device", default=os.environ.get("SCRIBE_DEVICE", "cpu"))
    parser.add_argument("--compute", default=os.environ.get("SCRIBE_COMPUTE", "int8"))
    args = parser.parse_args()

    from faster_whisper import WhisperModel

    workdir = None
    try:
        if is_url(args.source):
            workdir = tempfile.mkdtemp(prefix="scribe-")
            print(f"Downloading audio from: {args.source}")
            audio_path, title = download_audio(args.source, workdir)
            print(f"  Title: {title}")
        else:
            audio_path = os.path.expanduser(args.source)
            if not os.path.exists(audio_path):
                print(f"File not found: {audio_path}", file=sys.stderr)
                sys.exit(1)
            title = os.path.basename(audio_path)

        print(f"Loading Whisper model '{args.model}' (first run downloads it)…")
        model = WhisperModel(
            args.model, device=args.device, compute_type=args.compute
        )

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
            print("\nNo speech was detected in the audio.")
            return

        out = args.out or os.path.expanduser("~/transcript.txt")
        with open(out, "w", encoding="utf-8") as f:
            f.write(full + "\n")

        print(f"\n✅ Done. Detected language: {lang}")
        print(f"Full transcript saved to:\n  {out}")
        print(
            "\n(Open it on your Chromebook via the Files app → "
            "'Linux files' → transcript.txt)"
        )
    finally:
        if workdir and os.path.isdir(workdir):
            shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
