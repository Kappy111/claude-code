'use strict';

const api = window.voiceAPI;

const el = (id) => document.getElementById(id);
const shortcutBtn = el('shortcutBtn');
const shortcutText = el('shortcutText');
const modelSel = el('model');
const languageField = el('languageField');
const languageSel = el('language');
const micSel = el('mic');
const autoPaste = el('autoPaste');
const sounds = el('sounds');
const form = el('form');
const notice = el('notice');
const statusDot = el('statusDot');
const statusTitle = el('statusTitle');
const statusDetail = el('statusDetail');
const permHint = el('permHint');

let current = null;
let capturedShortcut = null;
let capturing = false;

// ---------------------------------------------------------------------------
// Shortcut capture → Electron accelerator string
// ---------------------------------------------------------------------------
function keyToAccelerator(e) {
  const parts = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  // Normalize to Electron accelerator key names.
  const map = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Enter: 'Return',
  };
  if (map[key]) key = map[key];
  else if (key.length === 1) key = key.toUpperCase();

  // Ignore lone modifier presses.
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  parts.push(key);
  return parts.join('+');
}

function startCapture() {
  capturing = true;
  shortcutBtn.classList.add('capturing');
  shortcutText.textContent = 'Press keys…';
}

function stopCapture() {
  capturing = false;
  shortcutBtn.classList.remove('capturing');
  shortcutText.textContent = capturedShortcut || (current && current.shortcut) || '—';
}

shortcutBtn.addEventListener('click', () => {
  if (capturing) stopCapture();
  else startCapture();
});

window.addEventListener('keydown', (e) => {
  if (!capturing) return;
  e.preventDefault();
  if (e.key === 'Escape') {
    stopCapture();
    return;
  }
  const accel = keyToAccelerator(e);
  if (!accel) return; // waiting for a non-modifier key
  // Require at least one modifier to avoid capturing plain keys.
  if (!/(Cmd|Ctrl|Alt|Shift)\+/.test(accel)) {
    showNotice('Please include a modifier (Cmd/Ctrl/Alt/Shift) in the shortcut.');
    return;
  }
  capturedShortcut = accel;
  stopCapture();
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function showNotice(msg) {
  notice.textContent = msg;
  notice.hidden = false;
}

function setStatus({ recording, modelReady, message, transcribing }) {
  if (recording) {
    statusDot.className = 'dot recording';
    statusTitle.textContent = 'Recording…';
    statusDetail.textContent = 'Press your shortcut again to stop and transcribe.';
  } else if (transcribing) {
    statusDot.className = 'dot busy';
    statusTitle.textContent = 'Transcribing…';
    statusDetail.textContent = 'Converting your speech to text locally.';
  } else if (modelReady) {
    statusDot.className = 'dot ready';
    statusTitle.textContent = 'Ready';
    statusDetail.textContent = 'Press your shortcut anywhere to dictate.';
  } else {
    statusDot.className = 'dot loading';
    statusTitle.textContent = message || 'Loading model…';
    statusDetail.textContent = 'First run downloads the model; this happens once.';
  }
}

function updateLanguageVisibility() {
  const isEnglishOnly = /\.en$/.test(modelSel.value);
  languageField.hidden = isEnglishOnly;
}

modelSel.addEventListener('change', updateLanguageVisibility);

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------
async function init() {
  current = await api.getSettings();
  capturedShortcut = current.shortcut;
  shortcutText.textContent = current.shortcut;
  modelSel.value = current.model;
  languageSel.value = current.language || 'auto';
  autoPaste.checked = !!current.autoPaste;
  sounds.checked = !!current.sounds;
  updateLanguageVisibility();

  permHint.textContent =
    api.platform === 'darwin'
      ? 'macOS: grant Microphone and Accessibility permissions to Voice Typer in System Settings → Privacy & Security for recording and auto-paste to work.'
      : api.platform === 'win32'
      ? 'Windows: allow microphone access if prompted. Auto-paste sends Ctrl+V to the focused app.'
      : 'Linux: auto-paste uses xdotool (X11) or wtype (Wayland); install one for auto-paste.';

  // Populate microphones.
  try {
    const mics = await api.listMics();
    for (const m of mics || []) {
      const opt = document.createElement('option');
      opt.value = m.deviceId;
      opt.textContent = m.label;
      micSel.appendChild(opt);
    }
    micSel.value = current.micDeviceId || '';
  } catch (_e) {
    /* ignore */
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.hidden = true;
  const next = {
    shortcut: capturedShortcut || current.shortcut,
    model: modelSel.value,
    language: languageSel.value,
    micDeviceId: micSel.value,
    autoPaste: autoPaste.checked,
    sounds: sounds.checked,
  };
  const res = await api.saveSettings(next);
  if (res && res.shortcutOk === false) {
    showNotice(
      'That shortcut could not be registered (it may be in use by the system or another app). Reverted to ' +
        res.settings.shortcut +
        '.'
    );
    capturedShortcut = res.settings.shortcut;
    shortcutText.textContent = res.settings.shortcut;
  } else {
    showNotice('Saved.');
    setTimeout(() => (notice.hidden = true), 1500);
  }
  current = (res && res.settings) || current;
});

el('testBtn').addEventListener('click', () => api.manualToggle());

// ---------------------------------------------------------------------------
// Live status from main/worker
// ---------------------------------------------------------------------------
api.onStatus((s) => setStatus(s));
api.onModelStatus((s) => {
  if (s.transcribing) setStatus({ transcribing: true });
  else if (s.ready) setStatus({ modelReady: true });
  else setStatus({ modelReady: false, message: s.message });
});
api.onNotice((m) => showNotice(m));

init();
