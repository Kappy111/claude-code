"use strict";
const $ = (s) => document.querySelector(s);

function setStatus(el, msg, err) {
  el.textContent = msg;
  el.classList.toggle("err", !!err);
}

/* ---------- EMAILS: delete all junk ---------- */
function waitTabComplete(id) {
  return new Promise((res) => {
    function l(tid, info) {
      if (tid === id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(l);
        res();
      }
    }
    chrome.tabs.onUpdated.addListener(l);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); res(); }, 10000);
  });
}
async function ensureGmailTab() {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true }); return tabs[0]; }
  const tab = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/" });
  await waitTabComplete(tab.id);
  await new Promise((r) => setTimeout(r, 1400));
  return tab;
}

$("#emailBtn").onclick = async () => {
  const st = $("#emailStatus");
  const btn = $("#emailBtn");
  // all the junk tabs; starred + real inbox are kept (content.js adds -is:starred)
  const query = "(category:promotions OR category:social OR category:updates OR category:forums)";
  btn.disabled = true;
  setStatus(st, "Opening Gmail…");
  let tab;
  try { tab = await ensureGmailTab(); }
  catch (e) { setStatus(st, "Couldn't open Gmail. Open it and try again.", true); btn.disabled = false; return; }

  setStatus(st, "Sweeping… watch Gmail do its thing 🧹");
  async function send() { return chrome.tabs.sendMessage(tab.id, { action: "dustSweep", query }); }
  try {
    const res = await send();
    setStatus(st, res ? res.msg : "Done.", res && res.ok === false);
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((r) => setTimeout(r, 500));
      const res = await send();
      setStatus(st, res ? res.msg : "Done.", res && res.ok === false);
    } catch (e2) {
      setStatus(st, "Open your Gmail tab, then tap the button again.", true);
    }
  }
  btn.disabled = false;
};

/* ---------- DOWNLOADS: two-tap delete ---------- */
let pendingIds = null;
const DL_DAYS = 30;
function fmt(b) {
  if (!b) return "";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1024)) + " KB";
}
$("#dlBtn").onclick = () => {
  const st = $("#dlStatus");
  const btn = $("#dlBtn");

  if (pendingIds === null) {
    // first tap = find and count
    setStatus(st, "Looking for old downloads…");
    chrome.runtime.sendMessage({ action: "findDownloads", days: DL_DAYS }, (res) => {
      const items = (res && res.items) || [];
      if (!items.length) {
        setStatus(st, "No old downloads found. Nice and tidy! ✨");
        return;
      }
      pendingIds = items.map((i) => i.id);
      const total = items.reduce((s, i) => s + (i.bytes || 0), 0);
      btn.innerHTML = `🗑️ Delete ${items.length} old files` +
        (total ? ` (${fmt(total)})` : "") + `<small>Tap again to delete — this is permanent</small>`;
      setStatus(st, `Found ${items.length} old downloads. Tap again to delete them.`);
    });
    return;
  }

  // second tap = actually delete
  setStatus(st, "Deleting for real…");
  btn.disabled = true;
  chrome.runtime.sendMessage({ action: "deleteDownloads", ids: pendingIds }, (res) => {
    const removed = (res && res.removed) || 0;
    const failed = (res && res.failed) || 0;
    pendingIds = null;
    btn.disabled = false;
    btn.innerHTML = `🗑️ Delete all old downloads<small>Files Chrome saved over a month ago</small>`;
    if (removed && !failed) setStatus(st, `Deleted ${removed} files for real. Storage freed! 🎉`);
    else if (removed && failed) setStatus(st, `Deleted ${removed}. ${failed} couldn't be removed (already gone or protected).`, true);
    else setStatus(st, `Couldn't delete those — they may already be gone, or your Chromebook blocks it.`, true);
  });
};

/* ---------- PHOTOS ---------- */
$("#photoBtn").onclick = () => {
  chrome.tabs.create({ url: "https://one.google.com/storage/management" });
};
