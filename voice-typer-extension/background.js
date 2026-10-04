// Service worker: owns the keyboard command, manages the offscreen document
// (which records audio + runs Whisper), and inserts the result at the cursor.

const OFFSCREEN_PATH = 'offscreen.html';

const DEFAULT_SETTINGS = {
  model: 'Xenova/whisper-base.en',
  language: 'auto',
  micDeviceId: '',
  autoInsert: true,
  sounds: true,
  preferGpu: true,
};

async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

// ---------------------------------------------------------------------------
// Offscreen document lifecycle
// ---------------------------------------------------------------------------
async function hasOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    return contexts.length > 0;
  }
  // Fallback for older Chrome.
  return false;
}

let creating = null;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Record the microphone and run local speech-to-text.',
  });
  try {
    await creating;
  } finally {
    creating = null;
  }
}

// ---------------------------------------------------------------------------
// Badge / icon state
// ---------------------------------------------------------------------------
function setRecordingBadge(on) {
  chrome.action.setBadgeText({ text: on ? '●' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#e5484d' });
}
function setBusyBadge() {
  chrome.action.setBadgeText({ text: '…' });
  chrome.action.setBadgeBackgroundColor({ color: '#d9900a' });
}
function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}

// ---------------------------------------------------------------------------
// Toggle recording (from command or popup)
// ---------------------------------------------------------------------------
async function toggleRecording() {
  // Remember the tab that was focused when dictation started so we can insert
  // the text there even if the service worker restarts meanwhile.
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab && tab.id != null) {
    await chrome.storage.session.set({ targetTabId: tab.id });
  }
  await ensureOffscreen();
  await waitForOffscreenReady();
  const settings = await getSettings();
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'toggle', settings });
}

// Ping the offscreen document until it answers, so the first "toggle" isn't
// dropped while its message listener is still being registered.
async function waitForOffscreenReady(attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ping' });
      if (res && res.ready) return true;
    } catch (_e) {
      /* no receiver yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-recording') toggleRecording();
});

// ---------------------------------------------------------------------------
// Insert transcription at the cursor of the focused element in the page.
// Injected into the page via chrome.scripting (activeTab grant from the
// keyboard command). Also copies to the clipboard as a fallback.
// ---------------------------------------------------------------------------
function insertAtCursor(text, doInsert) {
  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Always copy to the clipboard as a fallback / for clipboard-only mode.
  try {
    navigator.clipboard.writeText(text).catch(() => {});
  } catch (_e) {
    /* ignore */
  }

  if (!doInsert) return true; // clipboard-only mode

  const el = document.activeElement;
  let inserted = false;

  try {
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      const pos = start + text.length;
      el.selectionStart = el.selectionEnd = pos;
      fireInput(el);
      inserted = true;
    } else if (el && el.isContentEditable) {
      // Works for Gmail, most rich editors.
      inserted = document.execCommand('insertText', false, text);
    } else {
      inserted = document.execCommand('insertText', false, text);
    }
  } catch (_e) {
    inserted = false;
  }

  return inserted;
}

async function deliverTranscription(text) {
  const clean = (text || '').trim();
  if (!clean) return;

  const { targetTabId } = await chrome.storage.session.get('targetTabId');
  const tabId = targetTabId;
  if (tabId == null) return;

  const settings = await getSettings();

  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: insertAtCursor,
      args: [clean, settings.autoInsert],
    });
    if (settings.autoInsert && !result) {
      // Couldn't place the caret — the text is on the clipboard; let the popup
      // know so it can tell the user.
      chrome.runtime.sendMessage({
        target: 'popup',
        type: 'notice',
        message:
          'Could not find a text field to type into. The transcription was copied to your clipboard — press Ctrl+V to paste.',
      });
    }
  } catch (err) {
    chrome.runtime.sendMessage({
      target: 'popup',
      type: 'notice',
      message:
        'Could not insert text on this page (it may be a protected page). It was copied to your clipboard — press Ctrl+V. (' +
        err.message +
        ')',
    });
  }
}

// ---------------------------------------------------------------------------
// Messages from the offscreen document
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'background') return;

  switch (msg.type) {
    case 'state':
      if (msg.recording) setRecordingBadge(true);
      else setRecordingBadge(false);
      break;
    case 'transcribing':
      setBusyBadge();
      break;
    case 'transcription':
      clearBadge();
      deliverTranscription(msg.text);
      break;
    case 'error':
      clearBadge();
      break;
    default:
      break;
  }
});

// Expose a programmatic toggle for the popup's "Test" button.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.target === 'background' && msg.type === 'manual-toggle') {
    toggleRecording();
  }
});

// First install → open the setup/permission page so the user can grant the mic.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  }
});
