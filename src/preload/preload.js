'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mooresPayroll', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  getMeta: () => ipcRenderer.invoke('app:meta'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  openPub15t: () => ipcRenderer.invoke('app:openPub15t'),
  exportEncrypted: () => ipcRenderer.invoke('data:exportEncrypted'),
  exportDecrypted: () => ipcRenderer.invoke('data:exportDecrypted'),
  importBackup: (mode) => ipcRenderer.invoke('data:import', mode),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => {
      if (typeof callback === 'function') callback(payload);
    };
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  }
});
