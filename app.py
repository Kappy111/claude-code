"""
Scribe — turn videos into text.

A small local web app. Paste a video URL or upload a video/audio file; the
server downloads the audio with yt-dlp (for URLs), transcribes it with a local
Whisper model, and shows the text back on the page.

Everything runs on this machine — no audio or transcript ever leaves it.
"""

import os
import shutil
import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_from_directory,
)
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Whisper model sizes, smallest/fastest first. "base" is a good default
# balance of speed and accuracy for most machines.
WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"]
DEFAULT_MODEL = os.environ.get("SCRIBE_MODEL", "base")

# faster-whisper runtime settings. On a typical laptop or Chromebook CPU,
# int8 is the fastest and lightest. On a CUDA GPU box, override with
# SCRIBE_DEVICE=cuda and SCRIBE_COMPUTE=float16 for a big speed-up.
DEVICE = os.environ.get("SCRIBE_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("SCRIBE_COMPUTE", "int8")

# Where uploads and downloaded audio are temporarily staged.
WORK_ROOT = os.path.join(tempfile.gettempdir(), "scribe-work")
os.makedirs(WORK_ROOT, exist_ok=True)

# Max upload size for files (2 GB). URLs stream to disk and aren't bound by this.
MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024

# Audio/video extensions we accept for direct upload. Whisper reads anything
# ffmpeg can decode, so this is a generous allowlist rather than a hard limit.
ALLOWED_EXTENSIONS = {
    # audio
    "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff",
    # video
    "mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "m4v", "mpeg", "mpg",
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


# ---------------------------------------------------------------------------
# Job tracking
# ---------------------------------------------------------------------------


@dataclass
class Job:
    id: str
    source: str  # "url" or "file"
    label: str  # human-readable name of what's being transcribed
    model: str
    status: str = "queued"  # queued | downloading | transcribing | done | error
    progress: float = 0.0  # 0..100, meaningful during download
    message: str = ""
    text: str = ""
    language: str = ""
    error: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    workdir: str = ""

    def public(self):
        return {
            "id": self.id,
            "source": self.source,
            "label": self.label,
            "model": self.model,
            "status": self.status,
            "progress": round(self.progress, 1),
            "message": self.message,
            "text": self.text,
            "language": self.language,
            "error": self.error,
            "created_at": self.created_at,
        }


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.Lock()

# Whisper models are large and slow to load, so load each size once and reuse.
_MODEL_CACHE: dict[str, object] = {}
_MODEL_LOCK = threading.Lock()


def get_whisper_model(size: str):
    """Load (and cache) a faster-whisper model by size."""
    from faster_whisper import WhisperModel  # lazy so the server starts fast

    with _MODEL_LOCK:
        if size not in _MODEL_CACHE:
            _MODEL_CACHE[size] = WhisperModel(
                size, device=DEVICE, compute_type=COMPUTE_TYPE
            )
        return _MODEL_CACHE[size]


# ---------------------------------------------------------------------------
# Work: download + transcribe
# ---------------------------------------------------------------------------


def download_audio(job: Job, url: str) -> str:
    """Download the audio track of `url` with yt-dlp. Returns the audio path."""
    import yt_dlp

    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            got = d.get("downloaded_bytes", 0)
            if total:
                job.progress = min(99.0, got / total * 100.0)
            speed = d.get("speed")
            if speed:
                job.message = f"Downloading audio… {job.progress:.0f}%"
            else:
                job.message = "Downloading audio…"
        elif d.get("status") == "finished":
            job.progress = 100.0
            job.message = "Download finished, preparing audio…"

    outtmpl = os.path.join(job.workdir, "audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [hook],
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
        title = info.get("title")
        if title:
            job.label = title

    # After FFmpegExtractAudio the file is audio.mp3; fall back to whatever
    # landed in the workdir if the codec differed.
    mp3 = os.path.join(job.workdir, "audio.mp3")
    if os.path.exists(mp3):
        return mp3
    for name in os.listdir(job.workdir):
        if name.startswith("audio."):
            return os.path.join(job.workdir, name)
    raise RuntimeError("Could not locate downloaded audio file.")


def transcribe_audio(job: Job, audio_path: str):
    """Run local faster-whisper on `audio_path` and store the result on the job."""
    job.status = "transcribing"
    job.progress = 0.0
    job.message = f"Transcribing with Whisper ({job.model})…"
    model = get_whisper_model(job.model)

    # faster-whisper streams segments lazily; iterating runs the transcription
    # and lets us report real progress against the audio's total duration.
    segments, info = model.transcribe(audio_path, beam_size=5)
    job.language = (getattr(info, "language", "") or "") if info else ""
    duration = getattr(info, "duration", 0) or 0

    parts = []
    for seg in segments:
        parts.append(seg.text)
        if duration:
            job.progress = min(99.0, (seg.end / duration) * 100.0)
            job.message = f"Transcribing… {job.progress:.0f}%"
    job.text = "".join(parts).strip()


def run_job(job: Job, url: str | None, upload_path: str | None):
    """Full pipeline for one job, run in a background thread."""
    try:
        if url:
            job.status = "downloading"
            job.message = "Starting download…"
            audio_path = download_audio(job, url)
        else:
            audio_path = upload_path
            job.message = "Preparing uploaded file…"

        transcribe_audio(job, audio_path)

        if not job.text:
            job.status = "error"
            job.error = "No speech was detected in the audio."
            job.message = "Finished, but no text was produced."
        else:
            job.status = "done"
            job.message = "Done."
            job.progress = 100.0
    except Exception as exc:  # noqa: BLE001 - surface any failure to the user
        job.status = "error"
        job.error = str(exc)
        job.message = "Something went wrong."
    finally:
        # Clean up staged audio; keep the transcript in memory for retrieval.
        if job.workdir and os.path.isdir(job.workdir):
            shutil.rmtree(job.workdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template(
        "index.html",
        models=WHISPER_MODELS,
        default_model=DEFAULT_MODEL,
    )


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, "static"),
        "favicon.svg",
        mimetype="image/svg+xml",
    )


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/api/transcribe", methods=["POST"])
def api_transcribe():
    model = request.form.get("model", DEFAULT_MODEL)
    if model not in WHISPER_MODELS:
        model = DEFAULT_MODEL

    url = (request.form.get("url") or "").strip()
    upload = request.files.get("file")

    job_id = uuid.uuid4().hex
    workdir = os.path.join(WORK_ROOT, job_id)
    os.makedirs(workdir, exist_ok=True)

    upload_path = None
    source = "url"
    label = url

    if upload and upload.filename:
        source = "file"
        filename = secure_filename(upload.filename)
        if not _allowed_file(filename):
            shutil.rmtree(workdir, ignore_errors=True)
            return (
                jsonify({"error": f"Unsupported file type: {filename}"}),
                400,
            )
        upload_path = os.path.join(workdir, filename)
        upload.save(upload_path)
        label = filename
    elif not url:
        shutil.rmtree(workdir, ignore_errors=True)
        return jsonify({"error": "Provide a video URL or upload a file."}), 400

    job = Job(
        id=job_id,
        source=source,
        label=label or "Untitled",
        model=model,
        workdir=workdir,
    )
    with JOBS_LOCK:
        JOBS[job_id] = job

    thread = threading.Thread(
        target=run_job, args=(job, url or None, upload_path), daemon=True
    )
    thread.start()

    return jsonify(job.public()), 202


@app.route("/api/jobs/<job_id>")
def api_job(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    return jsonify(job.public())


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    # Bind to all interfaces by default so the page is reachable from the host
    # browser in sandboxed Linux environments (e.g. ChromeOS / Crostini, WSL),
    # where 127.0.0.1 inside the container isn't the browser's localhost.
    # Override with HOST=127.0.0.1 to restrict to loopback only.
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Scribe running on port {port}")
    print(f"  Local:      http://127.0.0.1:{port}")
    print(f"  Chromebook: http://penguin.linux.test:{port}")
    app.run(host=host, port=port, threaded=True, debug=False)
