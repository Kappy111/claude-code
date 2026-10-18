// Snapfolder background service worker.
//
// Owns screenshot capture (it needs tabs/scripting + OffscreenCanvas, which
// a short-lived popup can't reliably finish) and writes results to the shared
// IndexedDB. After a capture it opens the "Save screenshot" window so the user
// can confirm or change the folder.

import {
  captureVisible,
  captureArea,
  captureFullPage,
} from "./lib/capture.js";
import { addScreenshot, DEFAULT_FOLDER } from "./lib/db.js";

const LAST_FOLDER_KEY = "lastFolderId";

async function getLastFolderId() {
  const stored = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return stored[LAST_FOLDER_KEY] || DEFAULT_FOLDER.id;
}

async function flashBadge(text, color = "#4f46e5") {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1800);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

// Some pages can't be captured (Chrome Web Store, chrome:// pages, the New
// Tab page). Surface a clear message instead of a raw API error.
function restrictedUrl(url = "") {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}

async function openSaveDialog(recordId) {
  const url = chrome.runtime.getURL(`save.html?id=${recordId}`);
  try {
    await chrome.windows.create({
      url,
      type: "popup",
      width: 760,
      height: 520,
      focused: true,
    });
  } catch (_) {
    // If a popup window can't be created, fall back to a tab.
    chrome.tabs.create({ url });
  }
}

async function doCapture({ mode = "visible", folderId } = {}) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab to capture.");
  if (restrictedUrl(tab.url)) {
    throw new Error(
      "Chrome doesn't allow capturing this page (browser or store pages)."
    );
  }

  const targetFolder = folderId || (await getLastFolderId());

  let shot;
  if (mode === "area") shot = await captureArea(tab);
  else if (mode === "fullpage") shot = await captureFullPage(tab);
  else shot = await captureVisible(tab);

  if (!shot) return { cancelled: true }; // area selection was cancelled

  const record = await addScreenshot({
    folderId: targetFolder,
    title: tab.title || "Screenshot",
    url: tab.url || "",
    blob: shot.blob,
    thumb: shot.thumb,
    width: shot.width,
    height: shot.height,
  });

  await flashBadge("✓", "#16a34a");
  await openSaveDialog(record.id);
  return { id: record.id, folderId: record.folderId };
}

// Messages from the popup / library pages.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "CAPTURE") return false;
  doCapture(msg)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => {
      flashBadge("!", "#dc2626");
      sendResponse({ ok: false, error: String(err && err.message) });
    });
  return true; // keep the channel open for the async response
});

// Keyboard shortcut (Alt+Shift+S): capture the visible area into the last
// folder the user picked in the popup.
chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-visible") {
    doCapture({ mode: "visible" }).catch(() => flashBadge("!", "#dc2626"));
  }
});
