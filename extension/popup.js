import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listScreenshots,
  deleteScreenshot,
  countScreenshots,
  DEFAULT_FOLDER,
} from "./lib/db.js";
import * as auth from "./lib/auth.js";
import { formatDate } from "./lib/util.js";

const els = {
  folderSelect: document.getElementById("folder-select"),
  captureArea: document.getElementById("capture-area"),
  captureFull: document.getElementById("capture-full"),
  captureVisible: document.getElementById("capture-visible"),
  status: document.getElementById("status"),
  newFolderName: document.getElementById("new-folder-name"),
  addFolder: document.getElementById("add-folder"),
  folderList: document.getElementById("folder-list"),
  recentList: document.getElementById("recent-list"),
  recentEmpty: document.getElementById("recent-empty"),
  openLibrary: document.getElementById("open-library"),
  authSignedOut: document.getElementById("auth-signedout"),
  authForm: document.getElementById("auth-form"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authError: document.getElementById("auth-error"),
  authSignin: document.getElementById("auth-signin"),
  authSignup: document.getElementById("auth-signup"),
  authCancel: document.getElementById("auth-cancel"),
  authShowForm: document.getElementById("auth-show-form"),
  authSignedIn: document.getElementById("auth-signedin"),
  authEmailLabel: document.getElementById("auth-email-label"),
  authSignout: document.getElementById("auth-signout"),
};

const LAST_FOLDER_KEY = "lastFolderId";
let folders = [];
let counts = {};
let currentFolderId = DEFAULT_FOLDER.id;
let objectUrls = [];

function releaseObjectUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

function setStatus(text, kind = "") {
  els.status.className = `status${text ? " show " + kind : ""}`;
  els.status.textContent = text;
  if (text && kind === "ok") setTimeout(() => setStatus(""), 1600);
}

function folderName(id) {
  const f = folders.find((x) => x.id === id);
  return f ? f.name : "Unsorted";
}

async function loadFolders() {
  folders = await listFolders();
  counts = await countScreenshots();

  const stored = await chrome.storage.local.get(LAST_FOLDER_KEY);
  currentFolderId = stored[LAST_FOLDER_KEY] || DEFAULT_FOLDER.id;
  if (!folders.some((f) => f.id === currentFolderId)) {
    currentFolderId = DEFAULT_FOLDER.id;
  }

  // "Save to" dropdown.
  els.folderSelect.innerHTML = "";
  for (const folder of folders) {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    if (folder.id === currentFolderId) opt.selected = true;
    els.folderSelect.appendChild(opt);
  }

  renderFolderList();
}

function renderFolderList() {
  els.folderList.innerHTML = "";
  for (const folder of folders) {
    const li = document.createElement("li");
    li.className = "folder-item";

    const name = document.createElement("span");
    name.className = "f-name";
    name.textContent = folder.name;

    const count = document.createElement("span");
    count.className = "f-count";
    count.textContent = counts[folder.id] || 0;

    const rename = document.createElement("button");
    rename.className = "row-link";
    rename.textContent = "Rename";
    rename.disabled = !!folder.system;
    rename.addEventListener("click", () => startRename(li, folder));

    const del = document.createElement("button");
    del.className = "row-link danger";
    del.textContent = "Delete";
    del.disabled = !!folder.system;
    del.addEventListener("click", () => removeFolder(folder));

    li.append(name, count, rename, del);
    els.folderList.appendChild(li);
  }
}

function startRename(li, folder) {
  li.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "f-name-input";
  input.value = folder.name;
  input.maxLength = 60;

  const save = document.createElement("button");
  save.className = "row-link";
  save.textContent = "Save";

  const cancel = document.createElement("button");
  cancel.className = "row-link danger";
  cancel.textContent = "Cancel";

  const commit = async () => {
    const name = input.value.trim();
    if (name && name !== folder.name) {
      try {
        await renameFolder(folder.id, name);
      } catch (err) {
        setStatus(String(err.message || err), "error");
      }
    }
    await loadFolders();
  };

  save.addEventListener("click", commit);
  cancel.addEventListener("click", renderFolderList);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") renderFolderList();
  });

  li.append(input, save, cancel);
  input.focus();
  input.select();
}

async function removeFolder(folder) {
  const n = counts[folder.id] || 0;
  const msg = n
    ? `Delete “${folder.name}”? Its ${n} screenshot${
        n === 1 ? "" : "s"
      } will move to Unsorted.`
    : `Delete “${folder.name}”?`;
  if (!confirm(msg)) return;
  try {
    await deleteFolder(folder.id, { withShots: false });
    if (currentFolderId === folder.id) {
      currentFolderId = DEFAULT_FOLDER.id;
      await chrome.storage.local.set({ [LAST_FOLDER_KEY]: currentFolderId });
    }
    await loadFolders();
    await renderRecent();
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
}

async function addFolderFromInput() {
  const name = els.newFolderName.value.trim();
  if (!name) return;
  try {
    const folder = await createFolder(name);
    els.newFolderName.value = "";
    currentFolderId = folder.id;
    await chrome.storage.local.set({ [LAST_FOLDER_KEY]: currentFolderId });
    await loadFolders();
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
}

async function renderRecent() {
  releaseObjectUrls();
  const shots = (await listScreenshots()).slice(0, 6);
  els.recentList.innerHTML = "";
  els.recentEmpty.classList.toggle("hidden", shots.length > 0);

  for (const shot of shots) {
    const li = document.createElement("li");
    li.className = "recent-item";

    const img = document.createElement("img");
    img.className = "recent-thumb";
    const url = URL.createObjectURL(shot.thumb || shot.blob);
    objectUrls.push(url);
    img.src = url;
    img.alt = shot.title;
    img.addEventListener("click", () => openInLibrary(shot.id));

    const meta = document.createElement("div");
    meta.className = "recent-meta";
    const title = document.createElement("div");
    title.className = "recent-title";
    title.textContent = shot.title;
    title.title = shot.url || shot.title;
    title.addEventListener("click", () => openInLibrary(shot.id));
    const sub = document.createElement("div");
    sub.className = "recent-sub";
    sub.textContent = `${folderName(shot.folderId)} · ${formatDate(
      shot.createdAt
    )}`;
    meta.append(title, sub);

    const del = document.createElement("button");
    del.className = "row-link danger";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      await deleteScreenshot(shot.id);
      await loadFolders();
      await renderRecent();
    });

    li.append(img, meta, del);
    els.recentList.appendChild(li);
  }
}

function openInLibrary(shotId) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(
      `library.html#shot=${encodeURIComponent(shotId)}`
    ),
  });
}

async function capture(mode) {
  const label =
    mode === "area"
      ? "Select an area on the page…"
      : mode === "fullpage"
      ? "Capturing full page…"
      : "Capturing…";
  setStatus(label, "busy");
  els.captureArea.disabled = true;
  els.captureFull.disabled = true;
  els.captureVisible.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({
      type: "CAPTURE",
      mode,
      folderId: currentFolderId,
    });
    if (!res || !res.ok) throw new Error((res && res.error) || "Capture failed");
    if (res.cancelled) {
      setStatus("");
    } else {
      // The Save dialog opens in its own window; the popup will usually close.
      setStatus("Saved ✓", "ok");
      await loadFolders();
      await renderRecent();
    }
  } catch (err) {
    setStatus(String(err.message || err), "error");
  } finally {
    els.captureArea.disabled = false;
    els.captureFull.disabled = false;
    els.captureVisible.disabled = false;
  }
}

function renderAuth(user) {
  const signedIn = !!user;
  els.authSignedIn.classList.toggle("hidden", !signedIn);
  els.authSignedOut.classList.toggle("hidden", signedIn);
  if (signedIn) {
    els.authForm.classList.add("hidden");
    els.authEmailLabel.textContent = user.email || "your account";
  }
}

function showAuthError(msg) {
  els.authError.textContent = msg;
  els.authError.classList.toggle("hidden", !msg);
}

function setAuthBusy(busy) {
  els.authSignin.disabled = busy;
  els.authSignup.disabled = busy;
  els.authSignin.textContent = busy ? "…" : "Sign in";
}

async function doAuth(mode) {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !password) {
    showAuthError("Enter your email and password.");
    return;
  }
  showAuthError("");
  setAuthBusy(true);
  try {
    if (mode === "signup") await auth.signUp(email, password);
    else await auth.signIn(email, password);
    els.authPassword.value = "";
  } catch (err) {
    showAuthError(String(err.message || err));
  } finally {
    setAuthBusy(false);
  }
}

/* ------------------------------- Events --------------------------------- */

els.folderSelect.addEventListener("change", async () => {
  currentFolderId = els.folderSelect.value;
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: currentFolderId });
});

els.addFolder.addEventListener("click", addFolderFromInput);
els.newFolderName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addFolderFromInput();
});

els.captureArea.addEventListener("click", () => capture("area"));
els.captureFull.addEventListener("click", () => capture("fullpage"));
els.captureVisible.addEventListener("click", () => capture("visible"));

els.openLibrary.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
});

els.authShowForm.addEventListener("click", () => {
  els.authSignedOut.classList.add("hidden");
  els.authForm.classList.remove("hidden");
  els.authEmail.focus();
});
els.authCancel.addEventListener("click", () => {
  els.authForm.classList.add("hidden");
  els.authSignedOut.classList.remove("hidden");
  showAuthError("");
});
els.authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  doAuth("signin");
});
els.authSignup.addEventListener("click", () => doAuth("signup"));
els.authSignout.addEventListener("click", async () => {
  await auth.signOut();
  showAuthError("");
});

window.addEventListener("unload", releaseObjectUrls);

/* -------------------------------- Init ---------------------------------- */

(async function init() {
  auth.onChange(renderAuth);
  await auth.init();
  await loadFolders();
  await renderRecent();
})();
