// Hawk Eye — background service worker.
// Watches every page you navigate to. If the site is locked and not currently
// unlocked for this browser session, it redirects the tab to the Hawk Eye lock
// screen before the page can load.

const norm = (h) => String(h || "").replace(/^www\./, "").toLowerCase();

// A navigated host matches a stored host if it's the same site or a subdomain.
function hostMatch(navHost, storedHost) {
  navHost = norm(navHost);
  storedHost = norm(storedHost);
  return navHost === storedHost || navHost.endsWith("." + storedHost);
}

async function getSites() {
  const { sites } = await chrome.storage.local.get("sites");
  return Array.isArray(sites) ? sites : [];
}

async function isUnlocked(host) {
  const { unlocked } = await chrome.storage.session.get("unlocked");
  return !!(unlocked && unlocked[norm(host)]);
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only the main page, not embedded frames

  let url;
  try { url = new URL(details.url); } catch (e) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const host = norm(url.hostname);
  const sites = await getSites();
  const site = sites.find((s) => hostMatch(host, s.host));
  if (!site) return;

  if (await isUnlocked(site.host)) return; // already passed the lock this session

  const lockUrl =
    chrome.runtime.getURL("lock.html") +
    "?sid=" + encodeURIComponent(site.id) +
    "&target=" + encodeURIComponent(details.url);

  chrome.tabs.update(details.tabId, { url: lockUrl });
});

// Messages from the lock screen and the popup.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "unlock" && msg.host) {
    chrome.storage.session.get("unlocked").then(({ unlocked }) => {
      unlocked = unlocked || {};
      unlocked[norm(msg.host)] = true;
      chrome.storage.session.set({ unlocked }).then(() => sendResponse({ ok: true }));
    });
    return true; // keep the channel open for the async reply
  }
  if (msg && msg.type === "lockAll") {
    chrome.storage.session.set({ unlocked: {} }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "lockOne" && msg.host) {
    chrome.storage.session.get("unlocked").then(({ unlocked }) => {
      unlocked = unlocked || {};
      delete unlocked[norm(msg.host)];
      chrome.storage.session.set({ unlocked }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
});
