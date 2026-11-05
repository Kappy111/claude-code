// Hawk Eye — end-to-end UI test of the real popup.html and lock.html pages,
// using a mock of the chrome.* extension APIs injected before page scripts run.
const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");
const assert = require("assert");

const DIR = path.join(__dirname, "..");
const url = (f, q = "") => "file://" + path.join(DIR, f) + q;
const sha = (s) => crypto.createHash("sha256").update("hawkeye::" + s).digest("hex");

function initScript(seedSites) {
  return `(function(seed){
    var local = { sites: seed };
    var session = { unlocked: {} };
    var clone = function(o){ return o===undefined?undefined:JSON.parse(JSON.stringify(o)); };
    window.__sent = [];
    try { window.location.replace = function(u){ window.__nav = u; }; } catch(e){}
    window.chrome = {
      runtime: {
        getURL: function(p){ return "chrome-extension://fake/" + p; },
        sendMessage: function(msg, cb){
          window.__sent.push(msg);
          if (msg.type === "unlock") session.unlocked[String(msg.host).replace(/^www\\./,"").toLowerCase()] = true;
          if (msg.type === "lockAll") session.unlocked = {};
          if (cb) cb({ ok: true });
        }
      },
      storage: {
        local: {
          get: function(k){ return Promise.resolve(typeof k === "string" ? (function(o){o[k]=clone(local[k]);return o;})({}) : clone(local)); },
          set: function(o){ Object.keys(o).forEach(function(k){ local[k]=clone(o[k]); }); return Promise.resolve(); }
        },
        session: {
          get: function(k){ return Promise.resolve(typeof k === "string" ? (function(o){o[k]=clone(session[k]);return o;})({}) : clone(session)); },
          set: function(o){ Object.keys(o).forEach(function(k){ session[k]=clone(o[k]); }); return Promise.resolve(); }
        }
      }
    };
    window.__getLocal = function(){ return clone(local); };
    window.__getSession = function(){ return clone(session); };
  })(${JSON.stringify(seedSites)});`;
}

(async () => {
  const browser = await chromium.launch();
  let passed = 0;
  const ok = (n, c) => { assert.ok(c, "FAILED: " + n); passed++; console.log("   ✓ " + n); };
  const errors = [];

  async function newPage(seed) {
    const page = await browser.newPage();
    page.__nav = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // keep real navigations from leaving the test page, and record where it tried to go
    await page.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file:") || u.includes("fonts.g")) return r.continue();
      if (/^https?:/.test(u)) page.__nav.push(u);
      return r.abort();
    });
    await page.addInitScript({ content: initScript(seed) });
    return page;
  }

  try {
    // ---------- 1. POPUP: add a PIN-locked site ----------
    console.log("\n1) Popup — lock a new site with a PIN");
    let page = await newPage([]);
    await page.goto(url("popup.html"));
    await page.waitForSelector("#suSave");
    await page.fill("#suUrl", "poki.com");
    await page.fill("#suSecret", "1234");
    await page.click("#suSave");
    await page.waitForFunction(() => window.__getLocal().sites.length === 1);
    let sites = await page.evaluate(() => window.__getLocal().sites);
    ok("site saved", sites.length === 1);
    ok("host normalized to poki.com", sites[0].host === "poki.com");
    ok("lock type is pin", sites[0].type === "pin");
    ok("PIN stored as SHA-256 hash, not plain text", sites[0].secret === sha("1234") && sites[0].secret !== "1234");
    await page.close();

    // ---------- 2. POPUP: rejects junk input ----------
    console.log("\n2) Popup — rejects something that isn't a website");
    page = await newPage([]);
    await page.goto(url("popup.html"));
    await page.waitForSelector("#suSave");
    await page.fill("#suUrl", "notawebsite");
    await page.fill("#suSecret", "1234");
    await page.click("#suSave");
    await page.waitForFunction(() => document.getElementById("suErr").textContent.length > 0);
    const err = await page.textContent("#suErr");
    sites = await page.evaluate(() => window.__getLocal().sites);
    ok("shows an error", /website/i.test(err));
    ok("does not save a bad site", sites.length === 0);
    await page.close();

    // ---------- 3. LOCK: correct PIN grants access ----------
    console.log("\n3) Lock screen — correct PIN unlocks");
    const seed = [{ id: "a", name: "Game Vault", host: "poki.com", type: "pin", secret: sha("1234") }];
    page = await newPage(seed);
    await page.goto(url("lock.html", "?sid=a&target=https://poki.com/"));
    await page.waitForSelector(".keypad");
    ok("shows the locked site name", (await page.textContent("#siteName")).includes("poki.com"));
    for (const d of ["1", "2", "3", "4"]) await page.click(`.key[data-n="${d}"]`);
    await page.click('.key[data-a="ok"]');
    await page.waitForSelector(".granted", { timeout: 4000 });
    const sent = await page.evaluate(() => window.__sent);
    ok("ACCESS GRANTED shown", (await page.textContent(".granted")).includes("ACCESS GRANTED"));
    ok("sent unlock message for poki.com", sent.some((m) => m.type === "unlock" && m.host === "poki.com"));
    await page.waitForTimeout(900); // the lock screen navigates ~650ms after granting
    ok("navigates to the real target after unlock", page.__nav.includes("https://poki.com/"));
    await page.close();

    // ---------- 4. LOCK: wrong PIN 3x triggers lockout ----------
    console.log("\n4) Lock screen — 3 wrong tries = lockout");
    page = await newPage(seed);
    await page.goto(url("lock.html", "?sid=a&target=https://poki.com/"));
    await page.waitForSelector(".keypad");
    for (let round = 0; round < 3; round++) {
      for (const d of ["0", "0", "0", "0"]) await page.click(`.key[data-n="${d}"]`);
      await page.click('.key[data-a="ok"]');
      await page.waitForTimeout(80);
    }
    await page.waitForSelector(".lockout", { timeout: 4000 });
    ok("hawk lockout appears", (await page.textContent(".lockout")).toLowerCase().includes("too many"));
    ok("did NOT send an unlock on wrong PINs", (await page.evaluate(() => window.__sent)).length === 0);
    await page.close();

    // ---------- 5. LOCK: phrase type works too ----------
    console.log("\n5) Lock screen — secret phrase unlocks");
    const seed2 = [{ id: "p", name: "Diary", host: "example.com", type: "phrase", secret: sha("open sesame") }];
    page = await newPage(seed2);
    await page.goto(url("lock.html", "?sid=p&target=https://example.com/"));
    await page.waitForSelector("#phIn");
    await page.fill("#phIn", "Open Sesame"); // case-insensitive
    await page.click("#phGo");
    await page.waitForSelector(".granted", { timeout: 4000 });
    ok("phrase unlock grants access", (await page.textContent(".granted")).includes("ACCESS GRANTED"));
    await page.close();

    ok("no uncaught page errors across all pages", errors.length === 0);
    if (errors.length) console.log("   page errors:", errors);

    console.log(`\n  ✅ All ${passed} UI checks passed.\n`);
  } catch (e) {
    console.error("\n  ❌ TEST FAILED:", e.message);
    if (errors.length) console.error("  page errors:", errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
