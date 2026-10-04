'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Bridge exposed to both the hidden worker window and the settings window.
// Everything the renderer needs goes through here (contextIsolation is on).
contextBridge.exposeInMainWorld('voiceAPI', {
  // --- worker -> main ---
  setRecordingState: (isRecording) => ipcRenderer.send('recording-state', isRecording),
  sendTranscription: (text) => ipcRenderer.send('transcription', text),
  sendModelStatus: (payload) => ipcRenderer.send('model-status', payload),
  reportError: (message) => ipcRenderer.send('worker-error', message),

  // --- main -> worker ---
  onToggleRecording: (cb) => ipcRenderer.on('toggle-recording', () => cb()),
  onSettingsUpdated: (cb) => ipcRenderer.on('settings-updated', (_e, s) => cb(s)),

  // --- settings window <-> main ---
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  listMics: () => ipcRenderer.invoke('list-mics'),
  manualToggle: () => ipcRenderer.send('manual-toggle'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  onModelStatus: (cb) => ipcRenderer.on('model-status', (_e, s) => cb(s)),
  onNotice: (cb) => ipcRenderer.on('notice', (_e, m) => cb(m)),

  platform: process.platform,
});
