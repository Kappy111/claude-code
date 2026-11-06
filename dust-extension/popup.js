"use strict";
const $ = (s) => document.querySelector(s);

/* ---- tabs ---- */
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("sel", x === t));
    ["email", "dl", "photo"].forEach((p) => {
      $("#pane-" + p).hidden = p !== t.dataset.pane;
    });
  };
});

/* ---- helpers ---- */
function emailStatus(msg, err) {
  const el = $("#emailStatus");
  el.textContent = msg;
  el.classList.toggle("err", !!err);
}
function waitTabComplete(id) {
  return new Promise((res) => {
    function l(tid, info) {
      if (tid === id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(l);
        res();
      }
    }
    chrome.tabs.onUpdated.addListener(l);
    // safety timeout
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); res(); }, 9000);
  });
}
async function ensureGmailTab() {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    return tabs[0];
  }
  const tab = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/" });
  await waitTabComplete(tab.id);
  await new Promise((r) => setTimeout(r, 1200));
  return tab;
}

/* ---- Gmail sweep ---- */
async function sweep(query) {
  emailStatus("Opening Gmail…");
  let tab;
  try {
    tab = await ensureGmailTab();
  } catch (e) {
    emailStatus("Couldn't open Gmail. Open it and try again.", true);
    return;
  }
  emailStatus("Sweeping… watch Gmail do its thing 🧹");
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: "dustSweep", query });
    emailStatus(res ? res.msg : "Done.", res && res.ok === false);
  } catch (e) {
    // content script not loaded yet — inject and retry once
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((r) => setTimeout(r, 400));
      const res = await chrome.tabs.sendMessage(tab.id, { action: "dustSweep", query });
      emailStatus(res ? res.msg : "Done.", res && res.ok === false);
    } catch (e2) {
      emailStatus("Open your Gmail tab, then tap a sweep again.", true);
    }
  }
}

document.querySelectorAll("#pane-email .q").forEach((b) => {
  b.onclick = () => sweep(b.dataset.q);
});

$("#sweepBtn").onclick = () => {
  const parts = [];
  const date = $("#date").value;
  const stop = new Set(["all", "everything", "everyone", "any", "anyone", "*"]);
  const senders = $("#senders").value.split(",").map((s) => s.trim())
    .filter(Boolean).filter((s) => !stop.has(s.toLowerCase()));
  if (date) parts.push(date);
  if (senders.length) parts.push("from:(" + senders.join(" OR ") + ")");
  if ($("#promo").checked) parts.push("category:promotions");
  if (!parts.length) {
    emailStatus("Pick a date, add companies, or the Promotions tab first.", true);
    return;
  }
  sweep(parts.join(" "));
};

/* ---- Downloads ---- */
let foundIds = [];
function fmt(bytes) {
  if (!bytes) return "";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}
$("#findBtn").onclick = () => {
  const days = parseInt($("#dlDays").value, 10);
  $("#dlStatus").textContent = "Looking…";
  chrome.runtime.sendMessage({ action: "findDownloads", days }, (res) => {
    const items = (res && res.items) || [];
    foundIds = items.map((i) => i.id);
    const list = $("#dlList");
    list.innerHTML = "";
    if (!items.length) {
      list.hidden = true;
      $("#delBtn").hidden = true;
      $("#dlStatus").textContent = "No old downloads found. Nice and tidy!";
      return;
    }
    let total = 0;
    items.forEach((it) => {
      total += it.bytes || 0;
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = "<span></span><span></span>";
      row.children[0].textContent = it.name;
      row.children[1].textContent = fmt(it.bytes);
      list.appendChild(row);
    });
    list.hidden = false;
    $("#delBtn").hidden = false;
    $("#delBtn").textContent = `🗑️ Delete these ${items.length} files` + (total ? ` (${fmt(total)})` : "");
    $("#dlStatus").textContent = "";
  });
};
$("#delBtn").onclick = () => {
  if (!foundIds.length) return;
  $("#dlStatus").textContent = "Deleting…";
  chrome.runtime.sendMessage({ action: "deleteDownloads", ids: foundIds }, (res) => {
    const n = (res && res.removed) || 0;
    $("#dlList").hidden = true;
    $("#delBtn").hidden = true;
    foundIds = [];
    $("#dlStatus").textContent = `Deleted ${n} old downloads. Storage freed! 🎉`;
  });
};

/* ---- Photos ---- */
$("#photoBtn").onclick = () => {
  chrome.tabs.create({ url: "https://one.google.com/storage/management" });
};
