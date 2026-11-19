const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { pathToFileURL } = require('node:url')

async function boot({ bracketPath = false } = {}) {
  const windows = []
  const handlers = {}
  class Window extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.webContents = new EventEmitter()
      this.webContents.mainFrame = { url: '' }
      this.webContents.getURL = () => this.webContents.mainFrame.url
      this.webContents.setWindowOpenHandler = (handler) => { this.openHandler = handler }
      windows.push(this)
    }
    async loadURL(url) { this.webContents.mainFrame.url = url.replaceAll('%5B', '[').replaceAll('%5D', ']') }
    isDestroyed() { return !!this.destroyed }
    close() { this.emit('close'); this.destroyed = true; this.emit('closed') }
  }
  const source = { id: 'screen:1:0', name: 'Display 1', thumbnail: { toDataURL: () => 'data:image/png;base64,test' } }
  let clipboardText = ''
  const electron = {
    clipboard: { readText: () => clipboardText, writeText: text => { clipboardText = text } },
    app: { requestSingleInstanceLock: () => true, whenReady: async () => {}, on() {}, quit() {} }, BrowserWindow: Window,
    desktopCapturer: { getSources: async () => [source] },
    ipcMain: { handle: (name, fn) => { handlers[name] = fn }, on: (name, fn) => { handlers[name] = fn } },
    session: { defaultSession: {
      setPermissionCheckHandler: (fn) => { handlers.check = fn },
      setPermissionRequestHandler: (fn) => { handlers.permission = fn },
      setDisplayMediaRequestHandler: (fn) => { handlers.capture = fn },
    } }, dialog: { showErrorBox() {} },
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8'), {
    require: (name) => name === 'electron' ? electron : name.startsWith('./') ? require(path.join(__dirname, '../desktop', name)) : require(name),
    __dirname: bracketPath ? '/tmp/QR[1]/desktop' : path.join(__dirname, '../desktop'),
  })
  await new Promise(setImmediate)
  const main = windows[0]
  const request = { frame: main.webContents.mainFrame, videoRequested: true }
  return { windows, handlers, main, source, request }
}

test('capture grants only a selected source from the active picker', async () => {
  const { windows, handlers, main, source, request } = await boot()
  const replies = []
  handlers.capture(request, (value) => replies.push(value))
  const picker = windows[1]
  assert.equal(picker.options.webPreferences.sandbox, true)
  assert.equal(picker.options.webPreferences.nodeIntegration, false)
  const unauthorized = { senderFrame: main.webContents.mainFrame }
  assert.equal((await handlers['capture:sources'](unauthorized)).length, 0)
  handlers['capture:choose'](unauthorized, source.id)
  assert.equal(replies.length, 0)
  const event = { senderFrame: picker.webContents.mainFrame }
  const sources = await handlers['capture:sources'](event)
  assert.equal(sources[0].name, 'Display 1')
  handlers['capture:choose'](event, source.id)
  assert.equal(replies.length, 1)
  assert.equal(replies[0].video, source)
  assert.equal(picker.isDestroyed(), true)
})

test('closing the picker cancels once and permits a new capture', async () => {
  const { windows, handlers, request } = await boot()
  const replies = []
  handlers.capture(request, (value) => replies.push(value))
  windows[1].close()
  assert.equal(replies.length, 1)
  assert.equal(Object.keys(replies[0]).length, 0)
  handlers.capture(request, () => {})
  assert.equal(windows.length, 3)
})

test('untrusted frames and concurrent capture requests are denied', async () => {
  const { windows, handlers, request } = await boot()
  let denied
  handlers.capture({ ...request, frame: { url: request.frame.url } }, (result) => { denied = result })
  assert.equal(Object.keys(denied).length, 0)
  assert.equal(windows.length, 1)
  handlers.capture(request, () => {})
  handlers.capture(request, (result) => { denied = result })
  assert.equal(Object.keys(denied).length, 0)
  assert.equal(windows.length, 2)
})

test('main window closure cancels capture; navigation and unrelated permissions are blocked', async () => {
  const { windows, handlers, main, request } = await boot()
  assert.equal(handlers.check(main.webContents, 'display-capture'), true)
  assert.equal(handlers.check(main.webContents, 'geolocation'), false)
  assert.equal(handlers.check(null, 'media'), false)
  assert.equal(main.openHandler().action, 'deny')
  let prevented = false
  main.webContents.emit('will-navigate', { preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  let calls = 0
  handlers.capture(request, () => { calls++ })
  main.close()
  assert.equal(calls, 1)
  assert.equal(windows[1].isDestroyed(), true)
})


test('encoded path differences do not reject permissions or prevent the picker', async () => {
  const { windows, handlers, main, request } = await boot({ bracketPath: true })
  assert.equal(handlers.check(main.webContents, 'display-capture'), true)
  let allowed
  handlers.permission(main.webContents, 'display-capture', (value) => { allowed = value }, { isMainFrame: true })
  assert.equal(allowed, true)
  handlers.capture(request, () => {})
  assert.equal(windows.length, 2)
})

test('cancellation outcome is visible only to the trusted main frame', async () => {
  const { windows, handlers, main, request } = await boot()
  handlers.capture(request, () => {})
  const picker = windows[1]
  assert.equal(handlers['capture:outcome']({ sender: picker.webContents, senderFrame: picker.webContents.mainFrame }), null)
  picker.close()
  const outcome = handlers['capture:outcome']({ sender: main.webContents, senderFrame: main.webContents.mainFrame })
  assert.equal(outcome.status, 'cancelled')
  assert.equal(typeof outcome.at, 'number')
})

test('clipboard bridge is restricted to trusted main frame and bounded text', async () => {
  const { handlers, main } = await boot()
  const event = { sender: main.webContents, senderFrame: main.webContents.mainFrame }
  handlers['clipboard:write'](event, 'QRBR-ACK1:test')
  assert.equal(handlers['clipboard:read'](event), 'QRBR-ACK1:test')
  for (const invalid of [{ ...event, senderFrame: {} }, { ...event, sender: null }]) {
    assert.throws(() => handlers['clipboard:read'](invalid), /Untrusted/)
    assert.throws(() => handlers['clipboard:write'](invalid, 'text'), /Untrusted/)
  }
  assert.throws(() => handlers['clipboard:write'](event, {}), /Invalid/)
  assert.throws(() => handlers['clipboard:write'](event, 'x'.repeat(100001)), /Invalid/)
  assert.equal(handlers['clipboard:read'](event), 'QRBR-ACK1:test')
})

test('execution IPC rejects untrusted pages and child frames before starting a runtime', async () => {
  const { handlers, main } = await boot()
  assert.throws(() => handlers['execution:action']({ sender: null, senderFrame: main.webContents.mainFrame }, 'start'), /Untrusted execution/)
  assert.throws(() => handlers['execution:action']({ sender: main.webContents, senderFrame: {} }, 'configure', {}), /Untrusted execution/)
})
