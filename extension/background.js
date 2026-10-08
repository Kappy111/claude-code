// Background service worker. Coordinates "transcribe this tab": when the popup
// asks, it remembers which tab to capture, opens the Scribe app page, and hands
// that page a media-stream id it can turn into the tab's audio.

let pendingTargetTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "startTabCapture") {
    // Remember the tab the user wants to capture, then open the app page.
    pendingTargetTabId = msg.targetTabId;
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.type === "openApp") {
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.type === "requestTabStream") {
    // The app page is asking whether there's a pending capture for it.
    const appTabId = msg.appTabId;
    if (pendingTargetTabId == null || appTabId == null) {
      sendResponse({ streamId: null });
      return false;
    }
    const targetTabId = pendingTargetTabId;
    pendingTargetTabId = null;
    chrome.tabCapture.getMediaStreamId(
      { targetTabId, consumerTabId: appTabId },
      (streamId) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            streamId: null,
            error: chrome.runtime.lastError.message,
          });
        } else {
          sendResponse({ streamId });
        }
      }
    );
    return true; // async sendResponse
  }

  return false;
});
