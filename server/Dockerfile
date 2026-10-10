FROM python:3.11-slim

# ffmpeg is required by faster-whisper to decode audio/video.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache models in a writable dir (Hugging Face Spaces runs as a non-root user).
ENV HF_HOME=/tmp/hf
ENV XDG_CACHE_HOME=/tmp/cache

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Hugging Face Spaces expects the app on port 7860.
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
