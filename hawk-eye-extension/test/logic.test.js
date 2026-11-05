// Hawk Eye — logic tests for the real matching code the service worker runs.
// Run with:  node test/logic.test.js    (no dependencies needed)
const assert = require("assert");
const crypto = require("crypto");
const { heNorm, heHostMatch, heFindLock, heShouldLock } = require("../he-match.js");

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, "FAILED: " + name); passed++; };

// --- host normalizing ---
ok("strips www", heNorm("www.Poki.com") === "poki.com");
ok("lowercases", heNorm("YOUTUBE.COM") === "youtube.com");

// --- host matching ---
ok("exact match", heHostMatch("poki.com", "poki.com"));
ok("www variant matches", heHostMatch("www.poki.com", "poki.com"));
ok("subdomain matches", heHostMatch("games.poki.com", "poki.com"));
ok("different site does NOT match", !heHostMatch("notpoki.com", "poki.com"));
ok("look-alike does NOT match", !heHostMatch("poki.com.evil.com", "poki.com"));
ok("empty does NOT match", !heHostMatch("", "poki.com"));

// --- find the applicable lock ---
const sites = [
  { id: "a", host: "poki.com", type: "pin", secret: "x" },
  { id: "b", host: "youtube.com", type: "phrase", secret: "y" },
];
ok("finds poki", heFindLock("poki.com", sites).id === "a");
ok("finds youtube subdomain", heFindLock("m.youtube.com", sites).id === "b");
ok("finds nothing for unlisted", heFindLock("google.com", sites) === null);

// --- the real "should this navigation be blocked?" decision ---
ok("http locked site blocks", heShouldLock("https://poki.com/games", sites, {}).id === "a");
ok("www blocks", heShouldLock("https://www.poki.com/", sites, {}).id === "a");
ok("subdomain blocks", heShouldLock("https://games.poki.com/x", sites, {}).id === "a");
ok("unlisted site passes", heShouldLock("https://google.com/", sites, {}) === null);
ok("unlocked site passes", heShouldLock("https://poki.com/", sites, { "poki.com": true }) === null);
ok("chrome page passes", heShouldLock("chrome://settings", sites, {}) === null);
ok("about:blank passes", heShouldLock("about:blank", sites, {}) === null);
ok("look-alike site passes (no false block)", heShouldLock("https://poki.com.evil.com/", sites, {}) === null);
ok("empty site list passes", heShouldLock("https://poki.com/", [], {}) === null);

// --- hashing is deterministic and matches what the pages compute ---
// (pages do SHA-256 of "hawkeye::" + secret, hex) — mirror it here.
const h = (s) => crypto.createHash("sha256").update("hawkeye::" + s).digest("hex");
ok("hash is 64 hex chars", /^[0-9a-f]{64}$/.test(h("1234")));
ok("same input -> same hash", h("1234") === h("1234"));
ok("different input -> different hash", h("1234") !== h("1235"));

console.log(`\n  ✅ All ${passed} logic checks passed.\n`);
