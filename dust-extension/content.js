// Dust content script — runs inside Gmail and acts like your own hands:
// searches, selects everything that matches, and clicks Delete (-> Trash).
// No Google key needed. Anchored to Gmail's main toolbar [gh="mtb"].
(function () {
  "use strict";
  if (window.__dustLoaded) return;          // don't load twice
  window.__dustLoaded = true;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 9000, step = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      let v;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      await wait(step);
    }
    return null;
  }

  function findByText(re) {
    const els = document.querySelectorAll('span,a,div,button,[role="link"]');
    for (const e of els) {
      if (e.offsetParent === null) continue;
      const t = (e.textContent || "").trim();
      if (t && t.length < 90 && re.test(t)) return e;
    }
    return null;
  }

  async function dustSweep(query) {
    const full = query + " -is:starred";

    // 1) run the search (Gmail reacts to the URL hash)
    location.hash = "#search/" + encodeURIComponent(full);
    await wait(1800);

    // 2) wait for Gmail's main toolbar to exist
    const toolbar = await waitFor(() => document.querySelector('[gh="mtb"]'), 12000);
    if (!toolbar) return { ok: false, msg: "Gmail is slow to load — open it, then tap the button again." };

    // nothing matched?
    if (findByText(/no messages matched|no new mail/i)) {
      return { ok: false, msg: "Nothing junk left there — already clean! ✨" };
    }

    // 3) the select-all checkbox in the toolbar
    const cb = await waitFor(() => toolbar.querySelector('[role="checkbox"]'), 7000);
    if (!cb) return { ok: false, msg: "I searched your mail — tap the checkbox, then the trash can, to finish." };
    if (cb.getAttribute("aria-checked") !== "true") cb.click();
    await wait(900);

    // 4) "Select all conversations that match this search" (covers every page)
    const allLink = await waitFor(() => findByText(/select all .*conversation|select all .*match/i), 2500);
    if (allLink) { allLink.click(); await wait(700); }

    // 5) the Delete (trash) button
    const del = await waitFor(
      () => toolbar.querySelector('[aria-label="Delete"]:not([aria-disabled="true"]), [data-tooltip="Delete"]'),
      4000
    );
    if (!del) return { ok: false, msg: "Selected them — tap the trash can to finish the sweep." };
    del.click();
    await wait(800);

    // 6) confirm dialog ("OK" / "Delete") if Gmail asks
    const confirm = await waitFor(() => {
      const btns = document.querySelectorAll('button,[role="button"]');
      for (const b of btns) {
        if (b.offsetParent !== null && /^(ok|delete)$/i.test((b.textContent || "").trim())) return b;
      }
      return null;
    }, 2000);
    if (confirm) confirm.click();

    return { ok: true, msg: "Swept it all to Trash! 🧹 Inbox cleaned." };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === "dustSweep") {
      dustSweep(msg.query).then(sendResponse).catch(() =>
        sendResponse({ ok: false, msg: "Gmail changed something — your mail is searched, finish with a tap." })
      );
      return true; // async reply
    }
  });
})();
