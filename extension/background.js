// Snapfolder background service worker.
//
// Owns screenshot capture (it needs tabs/scripting + OffscreenCanvas, which
// a short-lived popup can't reliably finish) and writes results to the shared
// IndexedDB. UI pages re-read from IndexedDB after a capture resolves, so we
// never ship Blobs across the messaging boundary.

import { captureVisible, captureFullPage } from "./lib/capture.js";
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

async function doCapture({ mode = "visible", folderId } = {}) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab to capture.");
  if (restrictedUrl(tab.url)) {
    throw new Error(
      "Chrome doesn't allow capturing this page (browser or store pages)."
    );
  }

  const targetFolder = folderId || (await getLastFolderId());
  const shot =
    mode === "fullpage"
      ? await captureFullPage(tab)
      : await captureVisible(tab);

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
    doCapture({ mode: "visible" }).catch(() =>
      flashBadge("!", "#dc2626")
    );
  }
});
