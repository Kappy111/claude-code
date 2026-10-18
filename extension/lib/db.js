// IndexedDB layer for Snapfolder.
//
// Two object stores:
//   folders     { id, name, createdAt, updatedAt, remoteId }
//   screenshots { id, folderId, title, url, blob, thumb, width, height,
//                 size, createdAt, remoteId, synced }
//
// Screenshot image data is kept as a Blob (efficient, avoids base64 bloat).
// `remoteId` / `synced` are placeholders for the upcoming Supabase sync so we
// don't need a schema migration when it lands.

import { CONFIG } from "./config.js";

const DEFAULT_FOLDER = { id: "unsorted", name: "Unsorted", system: true };

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.db.name, CONFIG.db.version);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      if (!db.objectStoreNames.contains("folders")) {
        const folders = db.createObjectStore("folders", { keyPath: "id" });
        folders.createIndex("createdAt", "createdAt");
        // Seed the default folder as part of the upgrade transaction.
        folders.add({
          ...DEFAULT_FOLDER,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          remoteId: null,
        });
      }

      if (!db.objectStoreNames.contains("screenshots")) {
        const shots = db.createObjectStore("screenshots", { keyPath: "id" });
        shots.createIndex("folderId", "folderId");
        shots.createIndex("createdAt", "createdAt");
        shots.createIndex("synced", "synced");
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        result = fn(transaction);
      })
  );
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ------------------------------- Folders -------------------------------- */

export async function listFolders() {
  const db = await openDB();
  const folders = await reqToPromise(
    db.transaction("folders").objectStore("folders").getAll()
  );
  // Default folder first, then alphabetical.
  return folders.sort((a, b) => {
    if (a.system && !b.system) return -1;
    if (b.system && !a.system) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function createFolder(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Folder name is required");
  const folder = {
    id: uid(),
    name: clean,
    system: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    remoteId: null,
  };
  await tx("folders", "readwrite", (t) =>
    t.objectStore("folders").add(folder)
  );
  return folder;
}

export async function renameFolder(id, name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Folder name is required");
  const db = await openDB();
  const store = db.transaction("folders", "readwrite").objectStore("folders");
  const folder = await reqToPromise(store.get(id));
  if (!folder) throw new Error("Folder not found");
  if (folder.system) throw new Error("The default folder can't be renamed");
  folder.name = clean;
  folder.updatedAt = Date.now();
  return tx("folders", "readwrite", (t) =>
    t.objectStore("folders").put(folder)
  );
}

// Delete a folder. Its screenshots are moved to Unsorted by default, or
// deleted outright when `withShots` is true.
export async function deleteFolder(id, { withShots = false } = {}) {
  if (id === DEFAULT_FOLDER.id) {
    throw new Error("The default folder can't be deleted");
  }
  return tx(["folders", "screenshots"], "readwrite", (t) => {
    const shots = t.objectStore("screenshots");
    const index = shots.index("folderId");
    const cursorReq = index.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      if (withShots) {
        cursor.delete();
      } else {
        const shot = cursor.value;
        shot.folderId = DEFAULT_FOLDER.id;
        cursor.update(shot);
      }
      cursor.continue();
    };
    t.objectStore("folders").delete(id);
  });
}

/* ----------------------------- Screenshots ------------------------------ */

export async function addScreenshot(shot) {
  const record = {
    id: uid(),
    folderId: shot.folderId || DEFAULT_FOLDER.id,
    title: shot.title || "Untitled",
    url: shot.url || "",
    blob: shot.blob,
    thumb: shot.thumb || null,
    width: shot.width || 0,
    height: shot.height || 0,
    size: shot.blob ? shot.blob.size : 0,
    createdAt: Date.now(),
    remoteId: null,
    synced: 0,
  };
  await tx("screenshots", "readwrite", (t) =>
    t.objectStore("screenshots").add(record)
  );
  return record;
}

export async function listScreenshots(folderId) {
  const db = await openDB();
  const store = db.transaction("screenshots").objectStore("screenshots");
  let results;
  if (folderId) {
    results = await reqToPromise(
      store.index("folderId").getAll(IDBKeyRange.only(folderId))
    );
  } else {
    results = await reqToPromise(store.getAll());
  }
  return results.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getScreenshot(id) {
  const db = await openDB();
  return reqToPromise(
    db.transaction("screenshots").objectStore("screenshots").get(id)
  );
}

export async function moveScreenshot(id, folderId) {
  const db = await openDB();
  const store = db
    .transaction("screenshots", "readwrite")
    .objectStore("screenshots");
  const shot = await reqToPromise(store.get(id));
  if (!shot) throw new Error("Screenshot not found");
  shot.folderId = folderId;
  shot.synced = 0;
  return tx("screenshots", "readwrite", (t) =>
    t.objectStore("screenshots").put(shot)
  );
}

export async function deleteScreenshot(id) {
  return tx("screenshots", "readwrite", (t) =>
    t.objectStore("screenshots").delete(id)
  );
}

export async function countScreenshots() {
  const db = await openDB();
  const store = db.transaction("screenshots").objectStore("screenshots");
  const counts = {};
  return new Promise((resolve, reject) => {
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return resolve(counts);
      const fid = cursor.value.folderId;
      counts[fid] = (counts[fid] || 0) + 1;
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export { DEFAULT_FOLDER };
