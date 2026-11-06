// Dust content script — runs inside Gmail and acts like your own hands:
// searches, selects everything that matches, and clicks Delete (Trash).
// No Google key needed, because it just clicks what you would click.
(function () {
  "use strict";

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

  function visibleFindByText(re) {
    const els = document.querySelectorAll("span,a,div,button");
    for (const e of els) {
      if (e.offsetParent === null) continue;
      const t = (e.textContent || "").trim();
      if (t && re.test(t) && t.length < 80) return e;
    }
    return null;
  }

  async function dustSweep(query) {
    const full = query + " -is:starred";
    // 1) run the search (Gmail reacts to the URL hash)
    location.hash = "#search/" + encodeURIComponent(full);
    await wait(1600);

    // 2) find the "select" checkbox in the toolbar
    const selectBox = await waitFor(() => {
      const boxes = document.querySelectorAll('span[role="checkbox"][aria-label]');
      for (const b of boxes) {
        if (b.offsetParent !== null && /select/i.test(b.getAttribute("aria-label") || "")) return b;
      }
      return null;
    });
    if (!selectBox) {
      return { ok: false, msg: "I searched your mail, but couldn't find the select box. Click the checkbox and trash can to finish." };
    }

    // are there any results at all?
    const noResults = visibleFindByText(/no messages matched|no new mail/i);
    if (noResults) {
      return { ok: false, msg: "Nothing matched that search — your mail is already clean there!" };
    }

    // 3) select the page
    selectBox.click();
    await wait(700);

    // 4) click "Select all conversations that match this search" if it appears
    const allLink = await waitFor(
      () => visibleFindByText(/select all .*conversation|select all .*match/i),
      3500
    );
    if (allLink) { allLink.click(); await wait(500); }

    // 5) click Delete (moves to Trash)
    const del = await waitFor(
      () => document.querySelector('[aria-label="Delete"]:not([aria-disabled="true"]), [data-tooltip="Delete"]'),
      3500
    );
    if (!del) {
      return { ok: false, msg: "Searched and selected — now click the trash can to finish the sweep." };
    }
    del.click();
    await wait(600);

    // 6) confirm dialog ("OK" / "Delete") if Gmail asks
    const confirm = await waitFor(
      () => visibleFindByText(/^(ok|delete|confirm)$/i),
      1800
    );
    if (confirm) confirm.click();

    return { ok: true, msg: "Swept to Trash! 🧹 Freed up your inbox." };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === "dustSweep") {
      dustSweep(msg.query).then(sendResponse).catch((e) =>
        sendResponse({ ok: false, msg: "Something changed in Gmail. Your mail is searched — finish with a click." })
      );
      return true; // keep the channel open for the async reply
    }
  });
})();
