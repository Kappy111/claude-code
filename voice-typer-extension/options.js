'use strict';

const DEFAULTS = {
  model: 'Xenova/whisper-base.en',
  language: 'auto',
  micDeviceId: '',
  autoInsert: true,
  sounds: true,
  preferGpu: true,
};

const el = (id) => document.getElementById(id);
const modelSel = el('model');
const languageField = el('languageField');
const languageSel = el('language');
const micSel = el('mic');
const micHint = el('micHint');
const autoInsert = el('autoInsert');
const preferGpu = el('preferGpu');
const sounds = el('sounds');

function updateLanguageVisibility() {
  languageField.hidden = /\.en$/.test(modelSel.value);
}
modelSel.addEventListener('change', updateLanguageVisibility);

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  modelSel.value = s.model;
  languageSel.value = s.language;
  autoInsert.checked = s.autoInsert;
  preferGpu.checked = s.preferGpu;
  sounds.checked = s.sounds;
  updateLanguageVisibility();

  // WebGPU availability hint.
  if (!('gpu' in navigator)) {
    preferGpu.parentElement.querySelector('span').textContent =
      'Use GPU (WebGPU) when available — not detected on this device, will use CPU';
  }

  // Microphones.
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
    tmp.getTracks().forEach((t) => t.stop());
  } catch (_e) {
    micHint.textContent = 'Grant microphone access to see device names.';
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const d of devices.filter((x) => x.kind === 'audioinput')) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || 'Microphone';
      micSel.appendChild(opt);
    }
    micSel.value = s.micDeviceId || '';
  } catch (_e) {
    /* ignore */
  }
}

el('saveBtn').addEventListener('click', async () => {
  const settings = {
    model: modelSel.value,
    language: languageSel.value,
    micDeviceId: micSel.value,
    autoInsert: autoInsert.checked,
    preferGpu: preferGpu.checked,
    sounds: sounds.checked,
  };
  await chrome.storage.local.set({ settings });
  const saved = el('saved');
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
});

el('shortcutLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

load();
