// Dust background worker — finds and deletes old downloaded files.
// chrome.downloads.removeFile actually deletes the file from disk.
// It only affects files Chrome downloaded (not every file on the computer).
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
  let removed = 0;
  for (const id of ids) {
    try {
      await chrome.downloads.removeFile(id); // delete file from disk (into OS trash where supported)
      await chrome.downloads.erase({ id });   // remove from the download list
      removed++;
    } catch (e) { /* file already gone — skip */ }
  }
  return { removed };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "findDownloads") {
    findOld(msg.days).then(sendResponse);
    return true;
  }
  if (msg.action === "deleteDownloads") {
    deleteDownloads(msg.ids).then(sendResponse);
    return true;
  }
});
