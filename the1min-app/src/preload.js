const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('the1min', {
  // popup
  onState: (cb) => ipcRenderer.on('state', (_e, payload) => cb(payload)),
  close: () => ipcRenderer.send('popup:close'),
  deeper: (note) => ipcRenderer.send('popup:deeper', note),
  openSettings: () => ipcRenderer.send('popup:settings'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data) => ipcRenderer.send('settings:save', data)
});
