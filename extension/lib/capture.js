// Screenshot capture, used from the background service worker.
//
// captureVisible   -> the current viewport (fast, one shot)
// captureFullPage  -> scroll + stitch the whole page onto an OffscreenCanvas
//
// Returns { blob, thumb, width, height } where blob is a PNG and thumb is a
// small JPEG used for gallery tiles.

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

export async function captureVisible(tab) {
  const dataUrl = await captureVisibleTabThrottled(tab.windowId);
  const blob = await dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const thumb = await makeThumb(bitmap);
  const out = { blob, thumb, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return out;
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

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  const thumb = await makeThumb(bitmap);
  const out = { blob, thumb, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return out;
}
