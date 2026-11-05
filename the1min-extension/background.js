/* The1Min — service worker. Runs the optional auto-watch: when you've been idle for a
   minute (stuck and staring), it reads your active tab and opens a help window. */

importScripts('shared.js');

function armIdle() {
  try { chrome.idle.setDetectionInterval(60); } catch (e) {}
}
chrome.runtime.onInstalled.addListener(armIdle);
chrome.runtime.onStartup.addListener(armIdle);
armIdle();

let working = false;

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state !== 'idle' || working) return;
  const cfg = await self.t1mGetConfig();
  if (!cfg.watch || !cfg.apiKey) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) return;   // skip chrome:// and blank pages

  working = true;
  try {
    await chrome.storage.session.set({ current: { kind: 'thinking', reason: 'idle', ts: Date.now() } });
    const b64 = await self.t1mCapture(tab.windowId);
    const data = await self.t1mAsk(b64, '', cfg);
    await chrome.storage.session.set({ current: { kind: 'result', data, ts: Date.now() } });
    openPanel();
  } catch (e) {
    await chrome.storage.session.set({ current: { kind: 'error', message: e.message, ts: Date.now() } });
    openPanel();
  } finally {
    working = false;
  }
});

function openPanel() {
  chrome.windows.create({
    url: chrome.runtime.getURL('panel.html?mode=auto'),
    type: 'popup', width: 460, height: 600, focused: true
  });
}
