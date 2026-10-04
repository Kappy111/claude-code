'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  // Electron accelerator string. https://www.electronjs.org/docs/latest/api/accelerator
  shortcut: process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space',
  // Whisper model id on the Hugging Face Hub (ONNX community weights).
  model: 'Xenova/whisper-base.en',
  // Language hint: 'en' for the .en models, or e.g. 'auto'/'spanish' for multilingual.
  language: 'en',
  // Preferred microphone deviceId; empty = system default.
  micDeviceId: '',
  // Paste automatically after transcription.
  autoPaste: true,
  // Milliseconds to wait before firing the paste keystroke.
  pasteDelayMs: 150,
  // Play start/stop beeps.
  sounds: true,
  // Internal: show settings on first launch.
  firstRun: true,
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (_e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

module.exports = { DEFAULT_SETTINGS, loadSettings, saveSettings, settingsPath };
