// the1min — pure site-matching logic. No chrome/DOM use, so it can be loaded by
// the background service worker (importScripts) AND unit-tested in Node.

function heNorm(h) {
  return String(h || "").replace(/^www\./i, "").toLowerCase();
}

// A navigated host matches a stored host if it's the same site or a subdomain of it.
function heHostMatch(navHost, storedHost) {
  navHost = heNorm(navHost);
  storedHost = heNorm(storedHost);
  if (!navHost || !storedHost) return false;
  return navHost === storedHost || navHost.endsWith("." + storedHost);
}

// Find the locked site (if any) that applies to a navigated host.
function heFindLock(navHost, sites) {
  if (!Array.isArray(sites)) return null;
  return sites.find((s) => s && heHostMatch(navHost, s.host)) || null;
}

// Decide whether a navigation should be stopped at the lock screen.
// Returns the matching site when it should be locked, or null to allow through.
function heShouldLock(url, sites, unlockedMap) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const site = heFindLock(u.hostname, sites);
  if (!site) return null;
  if (unlockedMap && unlockedMap[heNorm(site.host)]) return null; // already unlocked
  return site;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { heNorm, heHostMatch, heFindLock, heShouldLock };
}
