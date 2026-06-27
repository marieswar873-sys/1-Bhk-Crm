const { contextBridge, ipcRenderer } = require('electron');

// Safe bridge so the React app can list printers and print silently.
contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (html, opts) => ipcRenderer.invoke('print-receipt', { html, ...opts }),
  printRaw: (data, opts) => ipcRenderer.invoke('print-raw', { data, ...opts }),
  getLicense: () => ipcRenderer.invoke('license-get'),
  activateLicense: (code) => ipcRenderer.invoke('license-activate', code),
  setCloudLicense: (obj) => ipcRenderer.invoke('license-set-cloud', obj),
});
