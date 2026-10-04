'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  session,
  systemPreferences,
  shell,
} = require('electron');
const path = require('path');
const { loadSettings, saveSettings, DEFAULT_SETTINGS } = require('./settings-store');
const { pasteFromClipboard } = require('./paste');
const { trayIconFor } = require('./tray-icon');

// Only one instance of the app may run at a time.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let settings = { ...DEFAULT_SETTINGS };
let workerWindow = null; // Hidden window that records audio and runs Whisper.
let settingsWindow = null; // Visible settings/status window.
let tray = null;
let recording = false;
let modelReady = false;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createWorkerWindow() {
  workerWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the hidden window running at full speed even when not visible so
      // recording and transcription are never throttled.
      backgroundThrottling: false,
    },
  });
  workerWindow.loadFile(path.join(__dirname, 'worker.html'));
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    title: 'Voice Typer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: recording ? '● Recording… (press hotkey to stop)' : 'Idle',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Shortcut: ${settings.shortcut}`,
      enabled: false,
    },
    {
      label: modelReady ? 'Model: ready' : 'Model: loading…',
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Settings…', click: () => createSettingsWindow() },
    {
      label: 'Quit Voice Typer',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setImage(trayIconFor(recording));
  tray.setToolTip(recording ? 'Voice Typer — recording' : 'Voice Typer — idle');
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(trayIconFor(false));
  refreshTray();
  // Double click opens settings (Windows-friendly).
  tray.on('double-click', () => createSettingsWindow());
}

// ---------------------------------------------------------------------------
// Global shortcut
// ---------------------------------------------------------------------------

function registerShortcut(accelerator) {
  globalShortcut.unregisterAll();
  if (!accelerator) return false;
  try {
    const ok = globalShortcut.register(accelerator, onHotkey);
    return ok;
  } catch (err) {
    console.error('Failed to register shortcut:', accelerator, err);
    return false;
  }
}

function onHotkey() {
  // Toggle recording. The worker window owns the microphone + model, so we just
  // tell it to flip state. It will report back via 'recording-state'.
  if (workerWindow && !workerWindow.isDestroyed()) {
    workerWindow.webContents.send('toggle-recording');
  }
}

// ---------------------------------------------------------------------------
// IPC — worker window <-> main
// ---------------------------------------------------------------------------

function wireIpc() {
  // Worker announces recording started/stopped (for tray + settings UI).
  ipcMain.on('recording-state', (_evt, isRecording) => {
    recording = !!isRecording;
    refreshTray();
    sendStatusToSettings();
  });

  // Worker announces model load progress / readiness.
  ipcMain.on('model-status', (_evt, payload) => {
    if (payload && payload.ready) modelReady = true;
    refreshTray();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('model-status', payload);
    }
  });

  // Worker delivers finished transcription text.
  ipcMain.on('transcription', async (_evt, text) => {
    const clean = (text || '').trim();
    sendStatusToSettings();
    if (!clean) return;

    clipboard.writeText(clean);

    if (settings.autoPaste) {
      // Small delay lets the OS settle focus back on the foreground app and
      // ensures the clipboard write has propagated before we send Cmd/Ctrl+V.
      setTimeout(() => {
        pasteFromClipboard().catch((err) => {
          console.error('Auto-paste failed:', err);
          notifySettings(
            'Auto-paste failed — text is on your clipboard, press ' +
              (process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V') +
              ' to paste. (' + err.message + ')'
          );
        });
      }, settings.pasteDelayMs);
    }
  });

  // Worker reports an error (mic denied, transcription failure, etc.).
  ipcMain.on('worker-error', (_evt, message) => {
    console.error('Worker error:', message);
    notifySettings(message);
  });

  // Settings window asks for the current settings.
  ipcMain.handle('get-settings', () => settings);

  // Settings window asks for the available microphones (relayed from worker).
  ipcMain.handle('list-mics', async () => {
    if (!workerWindow || workerWindow.isDestroyed()) return [];
    return workerWindow.webContents.executeJavaScript('window.__listMics && window.__listMics()');
  });

  // Settings window saves new settings.
  ipcMain.handle('save-settings', (_evt, next) => {
    const previousShortcut = settings.shortcut;
    settings = { ...settings, ...next };
    saveSettings(settings);

    let shortcutOk = true;
    if (settings.shortcut !== previousShortcut) {
      shortcutOk = registerShortcut(settings.shortcut);
      if (!shortcutOk) {
        // Roll back to the previous working shortcut.
        settings.shortcut = previousShortcut;
        saveSettings(settings);
        registerShortcut(previousShortcut);
      }
    }

    // Push model / device changes down to the worker.
    if (workerWindow && !workerWindow.isDestroyed()) {
      workerWindow.webContents.send('settings-updated', settings);
    }
    refreshTray();
    return { ok: true, shortcutOk, settings };
  });

  // Settings window wants to trigger recording manually (test button).
  ipcMain.on('manual-toggle', () => onHotkey());

  ipcMain.on('open-external', (_evt, url) => shell.openExternal(url));
}

function sendStatusToSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('status', { recording, modelReady });
  }
}

function notifySettings(message) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('notice', message);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  createSettingsWindow();
});

app.whenReady().then(async () => {
  settings = loadSettings();

  // On macOS, ask for microphone access up front so the system prompt appears
  // the first time rather than silently failing inside the hidden window.
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch (_e) {
      /* ignore — handled again at record time */
    }
  }

  // Hide the dock icon on macOS: this is a menu-bar/tray app.
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  // Allow the hidden worker window to use the microphone without a prompt
  // inside the app (OS-level permission is still enforced separately).
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'audioCapture';
  });

  createWorkerWindow();
  createTray();
  wireIpc();

  const ok = registerShortcut(settings.shortcut);
  if (!ok) {
    console.warn('Could not register shortcut', settings.shortcut);
  }

  // Send initial settings to the worker once it has loaded.
  workerWindow.webContents.once('did-finish-load', () => {
    workerWindow.webContents.send('settings-updated', settings);
  });

  // First launch: open settings so the user can see the hotkey and model status.
  if (settings.firstRun) {
    settings.firstRun = false;
    saveSettings(settings);
    createSettingsWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep running in the tray when all windows are closed.
app.on('window-all-closed', (e) => {
  // Do nothing — tray app stays alive.
});
