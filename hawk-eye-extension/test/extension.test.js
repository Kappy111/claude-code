// Loads the REAL unpacked Hawk Eye extension into Chromium and verifies the
// background service worker redirects a locked site to the lock screen.
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const DIR = path.join(__dirname, "..");

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "he-profile-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // use Chrome's NEW headless (below), which supports MV3 extensions
    args: [
      "--headless=new",
      `--disable-extensions-except=${DIR}`,
      `--load-extension=${DIR}`,
      "--no-sandbox",
    ],
  });

  try {
    // Wait for the MV3 service worker to register and learn the extension id.
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    console.log("   extension loaded, id =", extId);

    // Use the popup UI to lock example.com with PIN 1234 (writes real chrome.storage).
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForSelector("#suSave");
    await popup.fill("#suUrl", "example.com");
    await popup.fill("#suSecret", "1234");
    await popup.click("#suSave");
    await popup.waitForFunction(async () => {
      const { sites } = await chrome.storage.local.get("sites");
      return sites && sites.length === 1;
    });
    console.log("   locked example.com via popup");

    // Now try to visit the locked site — the worker should redirect to lock.html.
    const tab = await ctx.newPage();
    await tab.goto("http://example.com/").catch(() => {});
    await tab.waitForURL(/lock\.html/, { timeout: 10000 });
    const u = tab.url();
    const okRedirect = u.includes(`chrome-extension://${extId}/lock.html`) && u.includes("sid=");
    console.log("   navigated to:", u.slice(0, 72) + "...");

    if (okRedirect) console.log("\n  ✅ Real extension blocked the locked site at the lock screen.\n");
    else { console.error("\n  ❌ Expected a redirect to lock.html, got:", u); process.exitCode = 1; }
  } catch (e) {
    console.error("\n  ⚠  Could not run the full-extension smoke test here:", e.message);
    process.exitCode = 2;
  } finally {
    await ctx.close();
  }
})();
