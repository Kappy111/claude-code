/* The1Min — shared logic used by BOTH the popup (panel.js) and the service worker (background.js).
   Loaded via importScripts() in the worker and <script src> in the popup, so everything hangs
   off `self` (which is the global object in both contexts). No DOM is used here. */

self.T1M_DEFAULT_MODEL = 'claude-opus-5-5';

self.t1mGetConfig = function () {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'model', 'watch'], (v) => resolve({
      apiKey: v.apiKey || '',
      model: v.model || self.T1M_DEFAULT_MODEL,
      watch: v.watch !== false   // on by default
    }));
  });
};

self.t1mSetConfig = function (patch) {
  return new Promise((resolve) => chrome.storage.local.set(patch, resolve));
};

// Capture the active tab of a window and return downscaled PNG base64 (no data: prefix).
self.t1mCapture = async function (windowId) {
  const opts = { format: 'png' };
  const dataUrl = (windowId == null)
    ? await chrome.tabs.captureVisibleTab(opts)
    : await chrome.tabs.captureVisibleTab(windowId, opts);
  return self.t1mToB64(dataUrl, 1400);
};

// data:URL -> base64 string, downscaled so the API payload stays small. Works in worker and popup.
self.t1mToB64 = async function (dataUrl, maxW) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await out.arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
};

self.t1mInstructions = function (note) {
  return `You are The1Min, a calm, friendly helper. The person has been stuck on their computer for more than a minute. Below is a screenshot of the browser tab they are looking at.

Look at the screenshot. Work out what they are most likely trying to do and where they appear to be stuck — an error, a blank result, a confusing page, or a task that is not responding.
${note ? `The person also said: "${note}"` : ''}
Explain simply and kindly, the way you'd help a clever kid. Short, plain words.

Reply with ONLY a JSON object, no other text, shaped exactly like this:
{"problem":"<one friendly sentence naming what they seem stuck on>","steps":["<small concrete thing to try>","<next>","<next>"],"resource":"<the single best thing to look up or place to check, in plain words>","prompt":"<a short ready-to-paste prompt they can give an AI or a search box>","cheer":"<one short encouraging line, max 12 words>"}
Use 2 to 4 steps. Keep every string short. If the screenshot is unclear, make your best guess and say so gently in "problem".`;
};

self.t1mAsk = async function (b64, note, cfg) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
          { type: 'text', text: self.t1mInstructions(note) }
        ]
      }]
    })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error.message; } catch { try { detail = await res.text(); } catch {} }
    const e = new Error(detail || ('Request failed (' + res.status + ')'));
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return self.t1mParse(text);
};

self.t1mParse = function (text) {
  let obj = null;
  try { obj = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch {} }
  }
  if (!obj || typeof obj !== 'object') {
    return {
      problem: text || 'I had trouble reading the screen, but let\'s keep going.',
      steps: ['Tell me in a word or two what you were doing.', 'Then tap “dig deeper” and I\'ll try again.'],
      resource: 'Search the exact words of what\'s going wrong, plus the app or site you\'re using.',
      prompt: 'I\'m stuck. Here\'s what I was doing: ___. What should I try first?',
      cheer: 'Still here with you.'
    };
  }
  return {
    problem: String(obj.problem || 'Here\'s what I think you\'re stuck on.'),
    steps: Array.isArray(obj.steps) && obj.steps.length ? obj.steps.map(String).slice(0, 4)
           : ['Break it into the smallest piece that still goes wrong.', 'Try that one piece on its own.'],
    resource: String(obj.resource || 'Look up the exact wording of the problem plus the site\'s help pages.'),
    prompt: String(obj.prompt || 'I\'m trying to ___ but ___ happens. What\'s the simplest fix?'),
    cheer: String(obj.cheer || 'You\'ve got this.')
  };
};
