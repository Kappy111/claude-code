// Scribe app page. Decodes audio (from a file or a captured tab) to 16 kHz mono
// and sends it to the Whisper worker, then shows the transcript.

const el = (id) => document.getElementById(id);
const modelSel = el("model");
const dropzone = el("dropzone");
const fileInput = el("file");
const fileName = el("file-name");

const recording = el("recording");
const recTime = el("rec-time");
const stopBtn = el("stop-btn");

const statusCard = el("status-card");
const statusLabel = el("status-label");
const statusSub = el("status-sub");
const progressWrap = el("progress-wrap");
const progressBar = el("progress-bar");

const resultCard = el("result-card");
const transcript = el("transcript");
const errorCard = el("error-card");
const errorText = el("error-text");

const show = (n) => (n.hidden = false);
const hide = (n) => (n.hidden = true);

// --- Whisper worker --------------------------------------------------------
let worker = null;
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./whisper-worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === "progress") {
      // model file download progress
      if (payload && payload.status === "progress" && payload.total) {
        show(statusCard);
        statusLabel.textContent = "Downloading speech model (one time)…";
        statusSub.textContent = payload.file || "";
        show(progressWrap);
        progressBar.style.width =
          Math.round((payload.loaded / payload.total) * 100) + "%";
      }
    } else if (type === "status") {
      statusLabel.textContent = payload;
      statusSub.textContent = "This can take a while on a slower machine.";
      hide(progressWrap);
    } else if (type === "done") {
      hide(statusCard);
      transcript.value = payload.text || "(no speech detected)";
      show(resultCard);
    } else if (type === "error") {
      hide(statusCard);
      errorText.textContent = payload;
      show(errorCard);
    }
  };
  return worker;
}

// --- Audio decode (file or recorded blob) → Float32 @ 16 kHz mono ----------
async function decodeToMono16k(arrayBuffer) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  let buffer;
  try {
    buffer = await tmp.decodeAudioData(arrayBuffer);
  } finally {
    try { await tmp.close(); } catch (_) {}
  }
  const rate = 16000;
  const frames = Math.max(1, Math.ceil(buffer.duration * rate));
  const offline = new OfflineAudioContext(1, frames, rate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function startTranscription(audio) {
  hide(errorCard);
  hide(resultCard);
  show(statusCard);
  statusLabel.textContent = "Preparing…";
  statusSub.textContent = "";
  hide(progressWrap);
  ensureWorker().postMessage({
    type: "transcribe",
    audio,
    model: modelSel.value,
    language: "auto",
  });
}

async function handleArrayBuffer(arrayBuffer, label) {
  try {
    hide(errorCard);
    show(statusCard);
    statusLabel.textContent = "Reading audio…";
    statusSub.textContent = label || "";
    hide(progressWrap);
    const audio = await decodeToMono16k(arrayBuffer);
    startTranscription(audio);
  } catch (err) {
    hide(statusCard);
    errorText.textContent =
      "Couldn't read that audio: " +
      (err && err.message ? err.message : err) +
      ". Try an .mp3, .m4a, .wav, or .webm file.";
    show(errorCard);
  }
}

// --- File upload -----------------------------------------------------------
fileInput.addEventListener("change", async () => {
  const f = fileInput.files[0];
  if (!f) return;
  fileName.textContent = f.name;
  handleArrayBuffer(await f.arrayBuffer(), f.name);
});
["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
dropzone.addEventListener("drop", async (e) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  fileName.textContent = f.name;
  handleArrayBuffer(await f.arrayBuffer(), f.name);
});

// --- Tab-audio capture -----------------------------------------------------
let mediaStream = null;
let recorder = null;
let recChunks = [];
let recTimer = null;
let recStart = 0;
let audioCtx = null;

async function startTabRecording(streamId) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
  } catch (err) {
    errorText.textContent =
      "Couldn't capture this tab's audio: " +
      (err && err.message ? err.message : err);
    show(errorCard);
    return;
  }

  // Play the captured audio back so the tab isn't silent while recording.
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    const srcNode = audioCtx.createMediaStreamSource(mediaStream);
    srcNode.connect(audioCtx.destination);
    audioCtx.resume().catch(() => {});
  } catch (_) {}

  recChunks = [];
  recorder = new MediaRecorder(mediaStream);
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) recChunks.push(e.data);
  };
  recorder.onstop = async () => {
    try { mediaStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { if (audioCtx) await audioCtx.close(); } catch (_) {}
    hide(recording);
    const type = (recChunks[0] && recChunks[0].type) || "audio/webm";
    const blob = new Blob(recChunks, { type });
    handleArrayBuffer(await blob.arrayBuffer(), "Tab recording");
  };
  recorder.start();

  recStart = Date.now();
  recTime.textContent = "0:00";
  recTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recStart) / 1000);
    recTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
  show(recording);
}

stopBtn.addEventListener("click", () => {
  if (recTimer) clearInterval(recTimer);
  if (recorder && recorder.state !== "inactive") recorder.stop();
});

// On load, ask the background whether a tab capture is pending for this page.
(async () => {
  try {
    const me = await chrome.tabs.getCurrent();
    const resp = await chrome.runtime.sendMessage({
      type: "requestTabStream",
      appTabId: me ? me.id : null,
    });
    if (resp && resp.streamId) {
      startTabRecording(resp.streamId);
    } else if (resp && resp.error) {
      errorText.textContent = "Tab capture failed: " + resp.error;
      show(errorCard);
    }
  } catch (_) {
    // opened directly (file mode) — nothing to do.
  }
})();

// --- Copy / download -------------------------------------------------------
el("copy-btn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(transcript.value);
    el("copy-btn").textContent = "Copied!";
    setTimeout(() => (el("copy-btn").textContent = "Copy"), 1500);
  } catch (_) {
    transcript.select();
    document.execCommand("copy");
  }
});
el("download-btn").addEventListener("click", () => {
  const blob = new Blob([transcript.value], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "transcript.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});
