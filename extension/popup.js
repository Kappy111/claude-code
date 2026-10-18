import {
  listFolders,
  createFolder,
  listScreenshots,
  deleteScreenshot,
  DEFAULT_FOLDER,
} from "./lib/db.js";
import * as auth from "./lib/auth.js";
import { downloadScreenshot } from "./lib/util.js";

const els = {
  folderSelect: document.getElementById("folder-select"),
  newFolder: document.getElementById("new-folder"),
  captureVisible: document.getElementById("capture-visible"),
  captureFull: document.getElementById("capture-full"),
  status: document.getElementById("status"),
  gallery: document.getElementById("gallery"),
  galleryTitle: document.getElementById("gallery-title"),
  galleryCount: document.getElementById("gallery-count"),
  empty: document.getElementById("empty"),
  openLibrary: document.getElementById("open-library"),
  folderDialog: document.getElementById("folder-dialog"),
  folderName: document.getElementById("folder-name"),
  authArea: document.getElementById("auth-area"),
  authLabel: document.getElementById("auth-label"),
  authBtn: document.getElementById("auth-btn"),
};

const LAST_FOLDER_KEY = "lastFolderId";
let folders = [];
let currentFolderId = DEFAULT_FOLDER.id;
let objectUrls = [];

function releaseObjectUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

function setStatus(text, kind = "") {
  els.status.className = `status${text ? " show " + kind : ""}`;
  els.status.textContent = text;
}

async function loadFolders() {
  folders = await listFolders();
  const stored = await chrome.storage.local.get(LAST_FOLDER_KEY);
  currentFolderId = stored[LAST_FOLDER_KEY] || DEFAULT_FOLDER.id;
  if (!folders.some((f) => f.id === currentFolderId)) {
    currentFolderId = DEFAULT_FOLDER.id;
  }

  els.folderSelect.innerHTML = "";
  for (const folder of folders) {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    if (folder.id === currentFolderId) opt.selected = true;
    els.folderSelect.appendChild(opt);
  }
}

function folderName(id) {
  const f = folders.find((x) => x.id === id);
  return f ? f.name : "Unsorted";
}

async function renderGallery() {
  releaseObjectUrls();
  const shots = await listScreenshots(currentFolderId);
  els.galleryTitle.textContent = folderName(currentFolderId);
  els.galleryCount.textContent = shots.length
    ? `${shots.length} item${shots.length === 1 ? "" : "s"}`
    : "";
  els.gallery.innerHTML = "";
  els.empty.classList.toggle("hidden", shots.length > 0);

  // Keep the popup light — show the most recent dozen.
  for (const shot of shots.slice(0, 12)) {
    const tile = document.createElement("div");
    tile.className = "tile";

    const img = document.createElement("img");
    const url = URL.createObjectURL(shot.thumb || shot.blob);
    objectUrls.push(url);
    img.src = url;
    img.alt = shot.title;
    img.title = shot.title;
    img.addEventListener("click", () => openPreview(shot));

    const actions = document.createElement("div");
    actions.className = "tile-actions";

    const dl = document.createElement("button");
    dl.textContent = "Save";
    dl.title = "Download to disk";
    dl.addEventListener("click", async (e) => {
      e.stopPropagation();
      await downloadScreenshot(shot, folderName(shot.folderId));
      setStatus("Saved to Downloads/Snapfolder", "ok");
    });

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteScreenshot(shot.id);
      renderGallery();
    });

    actions.append(dl, del);
    tile.append(img, actions);
    els.gallery.appendChild(tile);
  }
}

function openPreview(shot) {
  // Open the full library and deep-link to this screenshot's lightbox. (We
  // avoid opening a raw blob: URL in a new tab, since the popup's blob URLs
  // are revoked the moment the popup closes.)
  const url = chrome.runtime.getURL(
    `library.html#shot=${encodeURIComponent(shot.id)}`
  );
  chrome.tabs.create({ url });
}

async function capture(mode) {
  els.captureVisible.disabled = true;
  els.captureFull.disabled = true;
  setStatus(
    mode === "fullpage" ? "Capturing full page…" : "Capturing…",
    "busy"
  );
  try {
    const res = await chrome.runtime.sendMessage({
      type: "CAPTURE",
      mode,
      folderId: currentFolderId,
    });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || "Capture failed");
    }
    setStatus("Saved ✓", "ok");
    await renderGallery();
    setTimeout(() => setStatus(""), 1500);
  } catch (err) {
    setStatus(String(err.message || err), "error");
  } finally {
    els.captureVisible.disabled = false;
    els.captureFull.disabled = false;
  }
}

function renderAuth(user) {
  if (user) {
    els.authArea.classList.add("online");
    els.authLabel.textContent = user.email || "Signed in";
    els.authBtn.textContent = "Sign out";
    els.authBtn.disabled = false;
  } else {
    els.authArea.classList.remove("online");
    els.authLabel.textContent = auth.isConfigured()
      ? "Signed out"
      : "Local only";
    els.authBtn.textContent = "Sign in";
    // Enabled only once Supabase is wired up.
    els.authBtn.disabled = !auth.isConfigured();
    els.authBtn.title = auth.isConfigured()
      ? "Sign in to sync"
      : "Cloud sync coming soon";
  }
}

/* ------------------------------- Events --------------------------------- */

els.folderSelect.addEventListener("change", async () => {
  currentFolderId = els.folderSelect.value;
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: currentFolderId });
  renderGallery();
});

els.newFolder.addEventListener("click", () => {
  els.folderName.value = "";
  els.folderDialog.showModal();
  els.folderName.focus();
});

els.folderDialog.addEventListener("close", async () => {
  if (els.folderDialog.returnValue !== "create") return;
  const name = els.folderName.value.trim();
  if (!name) return;
  try {
    const folder = await createFolder(name);
    await loadFolders();
    els.folderSelect.value = folder.id;
    currentFolderId = folder.id;
    await chrome.storage.local.set({ [LAST_FOLDER_KEY]: currentFolderId });
    renderGallery();
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
});

els.captureVisible.addEventListener("click", () => capture("visible"));
els.captureFull.addEventListener("click", () => capture("fullpage"));

els.openLibrary.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
});

els.authBtn.addEventListener("click", async () => {
  try {
    if (auth.getUser()) {
      await auth.signOut();
    } else {
      await auth.signIn();
    }
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
});

window.addEventListener("unload", releaseObjectUrls);

/* -------------------------------- Init ---------------------------------- */

(async function init() {
  auth.onChange(renderAuth);
  await auth.init();
  await loadFolders();
  await renderGallery();
})();
