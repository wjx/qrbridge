const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('qrDesktop', {
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  captureOutcome: () => ipcRenderer.invoke('capture:outcome'),
})
