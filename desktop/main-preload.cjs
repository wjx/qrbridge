const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('qrDesktop', {
  captureOutcome: () => ipcRenderer.invoke('capture:outcome'),
})
