// Tiny IndexedDB wrapper for VidToText session history.
// Two stores: "browser" (ephemeral local history) and "saved" (explicitly saved).
const DB_NAME = 'vidtotext';
const DB_VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('browser')) {
        db.createObjectStore('browser', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('saved')) {
        db.createObjectStore('saved', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    const result = fn(os);
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function putSession(store, session) {
  await tx(store, 'readwrite', os => os.put(session));
  return session;
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSession(store, id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(store, id) {
  await tx(store, 'readwrite', os => os.delete(id));
}

export async function clearStore(store) {
  await tx(store, 'readwrite', os => os.clear());
}
