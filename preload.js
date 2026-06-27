const { contextBridge, ipcRenderer } = require('electron');

// Safe bridge so the React app can list printers and print silently.
contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (html, opts) => ipcRenderer.invoke('print-receipt', { html, ...opts }),
});
