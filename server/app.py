"""VidToText transcription server.

Accepts an audio/video file and returns a timestamped transcript using
faster-whisper (CPU int8). Designed to run on a free Hugging Face Space
(Docker SDK) or any Docker host. The browser does the light work (grabbing
the media); this does the heavy transcription so low-end devices stay fast.
"""
import os
import tempfile

from fastapi import FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="VidToText Transcribe")

# Allow the static frontend (GitHub Pages, localhost, etc.) to call this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_MODELS = {}


def get_model(size: str) -> WhisperModel:
    size = size if size in ("tiny", "base", "small", "medium") else "base"
    if size not in _MODELS:
        # int8 keeps memory/CPU low enough for a free Space.
        _MODELS[size] = WhisperModel(size, device="cpu", compute_type="int8")
    return _MODELS[size]


@app.get("/")
def health():
    return {"ok": True, "service": "vidtotext-transcribe"}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    model: str = Query("base"),
    language: str | None = Query(None),
):
    data = await audio.read()
    suffix = os.path.splitext(audio.filename or "")[1] or ".bin"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        m = get_model(model)
        segments, info = m.transcribe(
            tmp.name,
            language=language or None,
            vad_filter=True,
            beam_size=1,
        )
        chunks = [
            {"start": float(s.start), "end": float(s.end), "text": s.text.strip()}
            for s in segments
            if s.text and s.text.strip()
        ]
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    text = " ".join(c["text"] for c in chunks)
    return {"text": text, "language": getattr(info, "language", None) or "auto", "chunks": chunks}
