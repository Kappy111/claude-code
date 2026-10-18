import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listScreenshots,
  getScreenshot,
  moveScreenshot,
  deleteScreenshot,
  countScreenshots,
  DEFAULT_FOLDER,
} from "./lib/db.js";
import * as auth from "./lib/auth.js";
import { downloadScreenshot, formatBytes, formatDate } from "./lib/util.js";

const els = {
  status: document.getElementById("status"),
  folderList: document.getElementById("folder-list"),
  newFolder: document.getElementById("new-folder"),
  folderTitle: document.getElementById("folder-title"),
  folderMeta: document.getElementById("folder-meta"),
  renameFolder: document.getElementById("rename-folder"),
  deleteFolder: document.getElementById("delete-folder"),
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightbox-img"),
  lightboxCaption: document.getElementById("lightbox-caption"),
  lightboxClose: document.getElementById("lightbox-close"),
  dialog: document.getElementById("folder-dialog"),
  dialogTitle: document.getElementById("folder-dialog-title"),
  folderName: document.getElementById("folder-name"),
  authArea: document.getElementById("auth-area"),
  authLabel: document.getElementById("auth-label"),
  authBtn: document.getElementById("auth-btn"),
};

let folders = [];
let counts = {};
let currentFolderId = DEFAULT_FOLDER.id;
let objectUrls = [];
let dialogMode = "create"; // "create" | "rename"
let lightboxUrl = null;

function releaseObjectUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

function setStatus(text, kind = "") {
  els.status.className = `status${text ? " show " + kind : ""}`;
  els.status.textContent = text;
  if (text && kind === "ok") setTimeout(() => setStatus(""), 2000);
}

function folderById(id) {
  return folders.find((f) => f.id === id);
}

async function refreshFolders() {
  folders = await listFolders();
  counts = await countScreenshots();
  if (!folderById(currentFolderId)) currentFolderId = DEFAULT_FOLDER.id;

  els.folderList.innerHTML = "";
  for (const folder of folders) {
    const li = document.createElement("li");
    li.className =
      "folder-item" + (folder.id === currentFolderId ? " active" : "");
    li.dataset.id = folder.id;

    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = folder.name;

    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = counts[folder.id] || 0;

    li.append(name, count);
    li.addEventListener("click", () => selectFolder(folder.id));

    // Drag-and-drop: drop a screenshot card here to move it.
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      li.classList.add("drop-target");
    });
    li.addEventListener("dragleave", () => li.classList.remove("drop-target"));
    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      li.classList.remove("drop-target");
      const shotId = e.dataTransfer.getData("text/plain");
      if (shotId && folder.id !== currentFolderId) {
        await moveScreenshot(shotId, folder.id);
        await refreshFolders();
        await renderGrid();
        setStatus(`Moved to “${folder.name}”`, "ok");
      }
    });

    els.folderList.appendChild(li);
  }
}

function selectFolder(id) {
  currentFolderId = id;
  refreshFolders();
  renderGrid();
}

function moveSelect(shot) {
  const select = document.createElement("select");
  select.className = "mini";
  const head = document.createElement("option");
  head.textContent = "Move to…";
  head.disabled = true;
  head.selected = true;
  select.appendChild(head);
  for (const f of folders) {
    if (f.id === shot.folderId) continue;
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  }
  select.addEventListener("change", async () => {
    await moveScreenshot(shot.id, select.value);
    await refreshFolders();
    await renderGrid();
    setStatus("Moved", "ok");
  });
  return select;
}

async function renderGrid() {
  releaseObjectUrls();
  const folder = folderById(currentFolderId) || DEFAULT_FOLDER;
  const shots = await listScreenshots(currentFolderId);

  els.folderTitle.textContent = folder.name;
  els.folderMeta.textContent = shots.length
    ? `${shots.length} screenshot${shots.length === 1 ? "" : "s"}`
    : "";
  els.deleteFolder.classList.toggle("hidden", !!folder.system);
  els.renameFolder.classList.toggle("hidden", !!folder.system);

  els.grid.innerHTML = "";
  els.empty.classList.toggle("hidden", shots.length > 0);

  for (const shot of shots) {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", shot.id);
      e.dataTransfer.effectAllowed = "move";
    });

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "card-thumb";
    const img = document.createElement("img");
    const url = URL.createObjectURL(shot.thumb || shot.blob);
    objectUrls.push(url);
    img.src = url;
    img.alt = shot.title;
    img.addEventListener("click", () => openLightbox(shot));
    thumbWrap.appendChild(img);

    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = shot.title;
    title.title = shot.url || shot.title;
    const sub = document.createElement("div");
    sub.className = "card-sub";
    sub.textContent = `${formatDate(shot.createdAt)} · ${shot.width}×${
      shot.height
    } · ${formatBytes(shot.size)}`;
    body.append(title, sub);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "mini";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => openLightbox(shot));

    const dlBtn = document.createElement("button");
    dlBtn.className = "mini";
    dlBtn.textContent = "Download";
    dlBtn.addEventListener("click", async () => {
      await downloadScreenshot(shot, folder.name);
      setStatus("Saved to Downloads/Snapfolder", "ok");
    });

    const delBtn = document.createElement("button");
    delBtn.className = "mini danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      await deleteScreenshot(shot.id);
      await refreshFolders();
      await renderGrid();
    });

    actions.append(openBtn, dlBtn, moveSelect(shot), delBtn);
    card.append(thumbWrap, body, actions);
    els.grid.appendChild(card);
  }
}

function openLightbox(shot) {
  if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
  lightboxUrl = URL.createObjectURL(shot.blob);
  els.lightboxImg.src = lightboxUrl;
  els.lightboxCaption.textContent = `${shot.title} — ${shot.width}×${shot.height}`;
  els.lightbox.classList.remove("hidden");
}

function closeLightbox() {
  els.lightbox.classList.add("hidden");
  els.lightboxImg.src = "";
  if (lightboxUrl) {
    URL.revokeObjectURL(lightboxUrl);
    lightboxUrl = null;
  }
}

function renderAuth(user) {
  if (user) {
    els.authArea.classList.add("online");
    els.authLabel.textContent = user.email || "Signed in";
    els.authBtn.textContent = "Sign out";
    els.authBtn.disabled = false;
    els.authBtn.title = "Sign out";
  } else {
    els.authArea.classList.remove("online");
    els.authLabel.textContent = "Not signed in";
    els.authBtn.textContent = "Sign in";
    els.authBtn.disabled = true;
    els.authBtn.title = "Sign in from the Snapfolder toolbar popup";
  }
}

/* ------------------------------- Events --------------------------------- */

els.newFolder.addEventListener("click", () => {
  dialogMode = "create";
  els.dialogTitle.textContent = "New folder";
  els.folderName.value = "";
  els.dialog.showModal();
  els.folderName.focus();
});

els.renameFolder.addEventListener("click", () => {
  const folder = folderById(currentFolderId);
  if (!folder || folder.system) return;
  dialogMode = "rename";
  els.dialogTitle.textContent = "Rename folder";
  els.folderName.value = folder.name;
  els.dialog.showModal();
  els.folderName.focus();
  els.folderName.select();
});

els.dialog.addEventListener("close", async () => {
  if (els.dialog.returnValue !== "save") return;
  const name = els.folderName.value.trim();
  if (!name) return;
  try {
    if (dialogMode === "create") {
      const folder = await createFolder(name);
      currentFolderId = folder.id;
    } else {
      await renameFolder(currentFolderId, name);
    }
    await refreshFolders();
    await renderGrid();
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
});

els.deleteFolder.addEventListener("click", async () => {
  const folder = folderById(currentFolderId);
  if (!folder || folder.system) return;
  const n = counts[folder.id] || 0;
  const msg = n
    ? `Delete “${folder.name}”? Its ${n} screenshot${
        n === 1 ? "" : "s"
      } will move to Unsorted.`
    : `Delete “${folder.name}”?`;
  if (!confirm(msg)) return;
  try {
    await deleteFolder(folder.id, { withShots: false });
    currentFolderId = DEFAULT_FOLDER.id;
    await refreshFolders();
    await renderGrid();
    setStatus("Folder deleted", "ok");
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
});

els.lightboxClose.addEventListener("click", closeLightbox);
els.lightbox.addEventListener("click", (e) => {
  if (e.target === els.lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

els.authBtn.addEventListener("click", async () => {
  // Only sign-out is actionable here; sign-in is done in the popup.
  if (auth.getUser()) {
    try {
      await auth.signOut();
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  }
});

window.addEventListener("unload", releaseObjectUrls);

// Refresh when the tab regains focus — e.g. after the Save dialog moved a
// screenshot into a different folder.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    await refreshFolders();
    await renderGrid();
  }
});

/* -------------------------------- Init ---------------------------------- */

async function handleDeepLink() {
  // popup links here as library.html#shot=<id> to preview a specific capture.
  const match = location.hash.match(/shot=([^&]+)/);
  if (!match) return;
  const shot = await getScreenshot(decodeURIComponent(match[1]));
  if (!shot) return;
  if (shot.folderId !== currentFolderId) {
    currentFolderId = shot.folderId;
    await refreshFolders();
    await renderGrid();
  }
  openLightbox(shot);
}

(async function init() {
  auth.onChange(renderAuth);
  await auth.init();
  await refreshFolders();
  await renderGrid();
  await handleDeepLink();
})();
