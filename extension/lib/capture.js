// Screenshot capture, used from the background service worker.
//
// captureVisible   -> the current viewport (fast, one shot)
// captureArea      -> drag-to-select a region, then crop the viewport shot
// captureFullPage  -> scroll + stitch the whole page onto an OffscreenCanvas
//
// Each returns { blob, thumb, width, height } where blob is a PNG and thumb
// is a small JPEG used for gallery tiles. captureArea returns null if the
// user cancels (Esc or a too-small selection).

// Chrome throttles captureVisibleTab to a couple of calls per second; space
// our calls out and retry when we hit the quota.
const CAPTURE_INTERVAL_MS = 450;
// Chrome caps a canvas at ~32,767px per side. Stay under that in *device*
// pixels so tall pages on high-DPI displays don't silently fail to stitch.
const MAX_CANVAS_PX = 32000;
const THUMB_MAX = 320;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function captureVisibleTabThrottled(windowId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, {
        format: "png",
      });
    } catch (err) {
      const msg = String(err && err.message);
      if (msg.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
        await delay(CAPTURE_INTERVAL_MS);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Capture was rate-limited by Chrome. Try again.");
}

async function makeThumb(bitmap) {
  const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
}

async function finalize(blob) {
  const bitmap = await createImageBitmap(blob);
  const thumb = await makeThumb(bitmap);
  const out = { blob, thumb, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return out;
}

export async function captureVisible(tab) {
  const dataUrl = await captureVisibleTabThrottled(tab.windowId);
  return finalize(await dataUrlToBlob(dataUrl));
}

// Injected into the page: shows a dim overlay, lets the user drag a rectangle,
// and resolves with { x, y, width, height, dpr } in CSS pixels — or null if
// cancelled. Must be fully self-contained (it's serialized to the page).
function selectAreaOverlay() {
  return new Promise((resolve) => {
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const Z = 2147483647;
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;z-index:${Z};cursor:crosshair;background:rgba(17,24,39,0.35);`;
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;border:2px solid #4f46e5;background:rgba(79,70,229,0.12);display:none;pointer-events:none;z-index:${Z};box-shadow:0 0 0 100000px rgba(17,24,39,0.35);`;
    const label = document.createElement("div");
    label.style.cssText = `position:fixed;background:#111827;color:#fff;font:600 12px/1.4 system-ui,sans-serif;padding:2px 7px;border-radius:5px;display:none;pointer-events:none;z-index:${Z};`;
    const hint = document.createElement("div");
    hint.textContent = "Drag to select an area · Esc to cancel";
    hint.style.cssText = `position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;font:600 13px system-ui,sans-serif;padding:7px 14px;border-radius:999px;z-index:${Z};pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,.4);`;
    document.documentElement.append(overlay, box, label, hint);

    // The dimmer is painted by the selection box's huge outset shadow, so the
    // chosen region reads as a bright cutout. Keep the base overlay subtle.
    let startX = 0;
    let startY = 0;
    let dragging = false;

    function cleanup() {
      overlay.remove();
      box.remove();
      label.remove();
      hint.remove();
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        resolve(null);
      }
    }
    function onDown(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      overlay.style.background = "transparent";
      box.style.display = "block";
      label.style.display = "block";
    }
    function onMove(e) {
      if (!dragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = w + "px";
      box.style.height = h + "px";
      label.textContent = `${w} × ${h}`;
      label.style.left = x + "px";
      label.style.top = Math.max(2, y - 24) + "px";
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      cleanup();
      if (w < 5 || h < 5) return resolve(null);
      resolve({ x, y, width: w, height: h, dpr: window.devicePixelRatio || 1 });
    }

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    overlay.addEventListener("mousedown", onDown);
  });
}

export async function captureArea(tab) {
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: selectAreaOverlay,
  });
  const rect = injected && injected.result;
  if (!rect) return null; // cancelled

  // Let the overlay's removal paint before we grab the screenshot.
  await delay(160);

  const dataUrl = await captureVisibleTabThrottled(tab.windowId);
  const full = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const dpr = rect.dpr;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.max(1, Math.round(rect.width * dpr));
  const sh = Math.max(1, Math.round(rect.height * dpr));

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  full.close();

  return finalize(await canvas.convertToBlob({ type: "image/png" }));
}

export async function captureFullPage(tab) {
  // Measure the page and remember the starting scroll position.
  const [{ result: metrics }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        scrollWidth: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0),
        scrollHeight: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0),
        clientWidth: doc.clientWidth,
        clientHeight: doc.clientHeight,
        dpr: window.devicePixelRatio || 1,
        startX: window.scrollX,
        startY: window.scrollY,
      };
    },
  });

  const dpr = metrics.dpr;
  const maxCssSide = Math.floor(MAX_CANVAS_PX / dpr);
  const totalHeight = Math.min(metrics.scrollHeight, maxCssSide);
  const totalWidth = Math.min(metrics.scrollWidth, maxCssSide);
  const viewH = metrics.clientHeight;
  const viewW = metrics.clientWidth;

  // Single viewport? fall back to the simple path.
  if (totalHeight <= viewH && totalWidth <= viewW) {
    return captureVisible(tab);
  }

  const canvas = new OffscreenCanvas(
    Math.round(totalWidth * dpr),
    Math.round(totalHeight * dpr)
  );
  const ctx = canvas.getContext("2d");

  // Hide scrollbars during capture so they don't streak down the stitch.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      window.__sf_prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    },
  });

  try {
    const yStops = [];
    for (let y = 0; y < totalHeight; y += viewH) yStops.push(y);
    const xStops = [];
    for (let x = 0; x < totalWidth; x += viewW) xStops.push(x);

    for (const y of yStops) {
      for (const x of xStops) {
        const [{ result: pos }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (sx, sy) => {
            window.scrollTo(sx, sy);
            return { x: window.scrollX, y: window.scrollY };
          },
          args: [x, y],
        });

        // Let sticky/lazy content settle, and respect the capture quota.
        await delay(CAPTURE_INTERVAL_MS);

        const dataUrl = await captureVisibleTabThrottled(tab.windowId);
        const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));
        ctx.drawImage(bmp, Math.round(pos.x * dpr), Math.round(pos.y * dpr));
        bmp.close();
      }
    }
  } finally {
    // Always restore scrollbars and the original scroll position.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sx, sy) => {
        document.documentElement.style.overflow =
          window.__sf_prevOverflow || "";
        delete window.__sf_prevOverflow;
        window.scrollTo(sx, sy);
      },
      args: [metrics.startX, metrics.startY],
    });
  }

  return finalize(await canvas.convertToBlob({ type: "image/png" }));
}
