// Dust background worker — really deletes old downloaded files and tells
// the truth about how many actually got removed.
"use strict";

function baseName(p) {
  if (!p) return "(file)";
  return p.split("/").pop().split("\\").pop();
}

async function findOld(days) {
  const cutoff = Date.now() - days * 86400000;
  const items = await chrome.downloads.search({ state: "complete", exists: true });
  const old = items
    .filter((it) => new Date(it.startTime).getTime() < cutoff)
    .map((it) => ({
      id: it.id,
      name: baseName(it.filename),
      bytes: it.fileSize || it.totalBytes || 0,
    }));
  return { items: old };
}

async function deleteDownloads(ids) {
  let removed = 0, failed = 0;
  for (const id of ids) {
    let ok = false;
    try {
      await chrome.downloads.removeFile(id); // actually deletes the file from disk
      ok = true;
      removed++;
    } catch (e) {
      failed++;                              // file couldn't be deleted (gone, or protected)
    }
    if (ok) { try { await chrome.downloads.erase({ id }); } catch (e) {} }
  }
  return { removed, failed };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "findDownloads") { findOld(msg.days).then(sendResponse); return true; }
  if (msg.action === "deleteDownloads") { deleteDownloads(msg.ids).then(sendResponse); return true; }
});
