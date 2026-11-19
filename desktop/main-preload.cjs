const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('qrDesktop', {
  execution: (action, value) => ipcRenderer.invoke('execution:action', action, value),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  captureOutcome: () => ipcRenderer.invoke('capture:outcome'),
})
