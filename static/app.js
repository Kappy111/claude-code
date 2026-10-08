(() => {
  "use strict";

  const form = document.getElementById("transcribe-form");
  const submitBtn = document.getElementById("submit-btn");
  const urlInput = document.getElementById("url");
  const fileInput = document.getElementById("file");
  const fileName = document.getElementById("file-name");
  const dropzone = document.getElementById("dropzone");

  const statusCard = document.getElementById("status-card");
  const statusLabel = document.getElementById("status-label");
  const statusSub = document.getElementById("status-sub");
  const spinner = document.getElementById("spinner");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");

  const resultCard = document.getElementById("result-card");
  const resultTitle = document.getElementById("result-title");
  const resultMeta = document.getElementById("result-meta");
  const transcript = document.getElementById("transcript");
  const copyBtn = document.getElementById("copy-btn");
  const downloadBtn = document.getElementById("download-btn");

  const errorCard = document.getElementById("error-card");
  const errorText = document.getElementById("error-text");

  let activeTab = "url";
  let poller = null;

  // --- Tabs -----------------------------------------------------------------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.toggle("is-active", t === tab));
      document.querySelectorAll(".panel").forEach((p) => {
        p.classList.toggle("is-active", p.dataset.panel === activeTab);
      });
    });
  });

  // --- File picker / drag & drop -------------------------------------------
  fileInput.addEventListener("change", () => {
    fileName.textContent = fileInput.files.length
      ? fileInput.files[0].name
      : "";
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-drag");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      fileName.textContent = e.dataTransfer.files[0].name;
    }
  });

  // --- Helpers --------------------------------------------------------------
  function show(el) {
    el.hidden = false;
  }
  function hide(el) {
    el.hidden = true;
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? "Working…" : "Transcribe";
  }

  const STATUS_LABELS = {
    queued: "Queued…",
    downloading: "Downloading audio",
    transcribing: "Transcribing",
    done: "Done",
    error: "Error",
  };

  function render(job) {
    statusLabel.textContent = STATUS_LABELS[job.status] || job.status;
    statusSub.textContent = job.message || "";

    if (job.status === "downloading" && job.progress > 0) {
      show(progressWrap);
      progressBar.style.width = job.progress + "%";
    } else if (job.status === "transcribing") {
      // Whisper gives no fine-grained progress; show an indeterminate feel.
      show(progressWrap);
      progressBar.style.width = "100%";
    } else {
      hide(progressWrap);
    }
  }

  function finishSuccess(job) {
    hide(statusCard);
    show(resultCard);
    resultTitle.textContent = "Transcript";
    const bits = [];
    if (job.label) bits.push(job.label);
    if (job.language) bits.push("Language: " + job.language);
    bits.push("Model: " + job.model);
    resultMeta.textContent = bits.join("  ·  ");
    transcript.value = job.text;
  }

  function finishError(message) {
    hide(statusCard);
    show(errorCard);
    errorText.textContent = message || "Unknown error.";
  }

  function poll(jobId) {
    poller = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error("Lost track of the job.");
        const job = await res.json();
        render(job);
        if (job.status === "done") {
          clearInterval(poller);
          setBusy(false);
          finishSuccess(job);
        } else if (job.status === "error") {
          clearInterval(poller);
          setBusy(false);
          finishError(job.error || job.message);
        }
      } catch (err) {
        clearInterval(poller);
        setBusy(false);
        finishError(err.message);
      }
    }, 900);
  }

  // --- Submit ---------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (poller) clearInterval(poller);

    hide(resultCard);
    hide(errorCard);

    const fd = new FormData();
    fd.append("model", document.getElementById("model").value);

    if (activeTab === "url") {
      const url = urlInput.value.trim();
      if (!url) {
        finishError("Please paste a video or audio URL.");
        show(errorCard);
        return;
      }
      fd.append("url", url);
    } else {
      if (!fileInput.files.length) {
        finishError("Please choose a file to upload.");
        show(errorCard);
        return;
      }
      fd.append("file", fileInput.files[0]);
    }

    setBusy(true);
    show(statusCard);
    statusLabel.textContent = "Uploading…";
    statusSub.textContent = "";
    hide(progressWrap);

    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      const job = await res.json();
      if (!res.ok) {
        setBusy(false);
        finishError(job.error || "Request failed.");
        return;
      }
      render(job);
      poll(job.id);
    } catch (err) {
      setBusy(false);
      finishError(err.message);
    }
  });

  // --- Copy / download ------------------------------------------------------
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(transcript.value);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    } catch {
      transcript.select();
      document.execCommand("copy");
    }
  });

  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([transcript.value], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transcript.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
