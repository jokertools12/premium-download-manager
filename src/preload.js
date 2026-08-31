'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdm', {
  invoke: (cmd, payload) => ipcRenderer.invoke('pdm', cmd, payload),
  onEvent: (cb) => ipcRenderer.on('pdm:event', (_e, data) => cb(data))
});
