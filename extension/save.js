import {
  getScreenshot,
  listFolders,
  createFolder,
  moveScreenshot,
  DEFAULT_FOLDER,
} from "./lib/db.js";
import { formatBytes, formatDate } from "./lib/util.js";

const els = {
  previewImg: document.getElementById("preview-img"),
  folderSelect: document.getElementById("folder-select"),
  newFolderName: document.getElementById("new-folder-name"),
  addFolder: document.getElementById("add-folder"),
  meta: document.getElementById("meta"),
  saveBtn: document.getElementById("save-btn"),
  keepBtn: document.getElementById("keep-btn"),
};

const shotId = new URLSearchParams(location.search).get("id");
let shot = null;
let folders = [];
let previewUrl = null;

function folderName(id) {
  const f = folders.find((x) => x.id === id);
  return f ? f.name : "Unsorted";
}

async function loadFolders(selectId) {
  folders = await listFolders();
  els.folderSelect.innerHTML = "";
  for (const folder of folders) {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    if (folder.id === selectId) opt.selected = true;
    els.folderSelect.appendChild(opt);
  }
}

async function addFolder() {
  const name = els.newFolderName.value.trim();
  if (!name) return;
  try {
    const folder = await createFolder(name);
    els.newFolderName.value = "";
    await loadFolders(folder.id);
  } catch (err) {
    alert(String(err.message || err));
  }
}

els.addFolder.addEventListener("click", addFolder);
els.newFolderName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addFolder();
});

els.saveBtn.addEventListener("click", async () => {
  const target = els.folderSelect.value;
  try {
    if (shot && target !== shot.folderId) {
      await moveScreenshot(shot.id, target);
    }
  } catch (err) {
    alert(String(err.message || err));
    return;
  }
  window.close();
});

els.keepBtn.addEventListener("click", () => window.close());

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.close();
});
window.addEventListener("unload", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});

(async function init() {
  if (!shotId) {
    document.body.innerHTML =
      "<p style='padding:24px'>No screenshot to save.</p>";
    return;
  }
  shot = await getScreenshot(shotId);
  if (!shot) {
    document.body.innerHTML =
      "<p style='padding:24px'>Screenshot not found.</p>";
    return;
  }

  previewUrl = URL.createObjectURL(shot.blob);
  els.previewImg.src = previewUrl;

  await loadFolders(shot.folderId || DEFAULT_FOLDER.id);

  // "Keep in <current folder>" mirrors where the shot already landed.
  els.keepBtn.textContent = `Keep in ${folderName(shot.folderId)}`;

  els.meta.textContent = `${shot.width}×${shot.height} · ${formatBytes(
    shot.size
  )} · ${formatDate(shot.createdAt)}`;

  els.saveBtn.focus();
})();
