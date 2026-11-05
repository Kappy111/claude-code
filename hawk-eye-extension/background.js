// Hawk Eye — background service worker.
// Watches every page you navigate to. If the site is locked and not currently
// unlocked for this browser session, it redirects the tab to the Hawk Eye lock
// screen before the page can load.

importScripts("he-match.js"); // heNorm, heFindLock, heShouldLock

async function getSites() {
  const { sites } = await chrome.storage.local.get("sites");
  return Array.isArray(sites) ? sites : [];
}

async function getUnlocked() {
  const { unlocked } = await chrome.storage.session.get("unlocked");
  return unlocked || {};
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only the main page, not embedded frames

  const sites = await getSites();
  if (!sites.length) return;
  const unlocked = await getUnlocked();

  const site = heShouldLock(details.url, sites, unlocked);
  if (!site) return;

  const lockUrl =
    chrome.runtime.getURL("lock.html") +
    "?sid=" + encodeURIComponent(site.id) +
    "&target=" + encodeURIComponent(details.url);

  chrome.tabs.update(details.tabId, { url: lockUrl });
});

// Messages from the lock screen and the popup.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "unlock" && msg.host) {
    getUnlocked().then((unlocked) => {
      unlocked[heNorm(msg.host)] = true;
      chrome.storage.session.set({ unlocked }).then(() => sendResponse({ ok: true }));
    });
    return true; // keep the channel open for the async reply
  }
  if (msg && msg.type === "lockAll") {
    chrome.storage.session.set({ unlocked: {} }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "lockOne" && msg.host) {
    getUnlocked().then((unlocked) => {
      delete unlocked[heNorm(msg.host)];
      chrome.storage.session.set({ unlocked }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
});
