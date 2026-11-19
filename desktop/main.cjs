const { app, BrowserWindow, desktopCapturer, ipcMain, session, dialog, clipboard } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { isTrustedPage } = require('./trusted-page.cjs')

const rendererPath = path.join(__dirname, '../dist-desktop/index.html')
let mainWindow
let pendingCapture
let captureOutcome = null

function isLocal(contents) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && contents === mainWindow.webContents && isTrustedPage(contents.getURL(), rendererPath))
}

ipcMain.handle('capture:outcome', (event) => {
  if (!isLocal(event.sender) || event.senderFrame !== mainWindow.webContents.mainFrame) return null
  return captureOutcome
})

ipcMain.handle('clipboard:read', (event) => {
  if (!isLocal(event.sender) || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Untrusted clipboard access')
  return clipboard.readText()
})
ipcMain.handle('clipboard:write', (event, text) => {
  if (!isLocal(event.sender) || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Untrusted clipboard access')
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Invalid clipboard text')
  clipboard.writeText(text)
})

function lockNavigation(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
}

function finishCapture(source, status = source ? 'selected' : 'cancelled', closePicker = true) {
  const pending = pendingCapture
  if (!pending) return
  pendingCapture = null
  captureOutcome = { status, at: Date.now() }
  try { pending.callback(source ? { video: source } : {}) } catch { /* Requesting frame closed. */ }
  if (closePicker && !pending.picker.isDestroyed()) pending.picker.close()
}

ipcMain.handle('capture:sources', async (event) => {
  const pending = pendingCapture
  if (!pending || event.senderFrame !== pending.picker.webContents.mainFrame) return []
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
  if (pendingCapture !== pending) return []
  pending.sources = sources
  return sources.map(({ id, name, thumbnail }) => ({ id, name, thumbnail: thumbnail.toDataURL() }))
})
ipcMain.on('capture:choose', (event, id) => {
  if (!pendingCapture || event.senderFrame !== pendingCapture.picker.webContents.mainFrame) return
  finishCapture(pendingCapture.sources.find((source) => source.id === id))
})

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'QR Bridge', width: 1050, height: 850, minWidth: 600, minHeight: 500,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'main-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  lockNavigation(mainWindow)
  mainWindow.on('closed', () => { finishCapture(); mainWindow = null })
  mainWindow.loadURL(pathToFileURL(rendererPath).href).catch((error) => dialog.showErrorBox('Unable to start QR Bridge', error.message))
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((contents, permission) =>
    Boolean(isLocal(contents) && ['media', 'display-capture'].includes(permission)))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(Boolean(isLocal(contents) && details.isMainFrame && ['media', 'display-capture'].includes(permission)))
  })
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!mainWindow || request.frame !== mainWindow.webContents.mainFrame || !isTrustedPage(request.frame.url, rendererPath) || !request.videoRequested || pendingCapture) {
      callback({})
      return
    }
    captureOutcome = null
    const picker = new BrowserWindow({
      parent: mainWindow, modal: true, width: 850, height: 650, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    pendingCapture = { callback, picker, sources: [] }
    lockNavigation(picker)
    // Record cancellation before closing aborts a pending page load.
    picker.on('close', () => {
      if (pendingCapture?.picker === picker) finishCapture(undefined, 'cancelled', false)
    })
    picker.loadURL(pathToFileURL(path.join(__dirname, 'picker.html')).href).catch(() => {
      if (pendingCapture?.picker === picker) finishCapture(undefined, 'failed')
    })
  })
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})
app.on('window-all-closed', () => app.quit())
