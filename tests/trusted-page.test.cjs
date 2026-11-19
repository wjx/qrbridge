const test = require('node:test')
const assert = require('node:assert/strict')
const { isTrustedPage } = require('../desktop/trusted-page.cjs')

test('Windows portable paths accept equivalent Chromium and Node file URLs', () => {
  const expected = String.raw`C:\Users\用户[1]\AppData\Local\Temp\QR Bridge\resources\app.asar\dist-desktop\index.html`
  const chromium = 'file:///C:/Users/%E7%94%A8%E6%88%B7[1]/AppData/Local/Temp/QR%20Bridge/resources/app.asar/dist-desktop/index.html'
  assert.equal(isTrustedPage(chromium, expected, 'win32'), true)
  assert.equal(isTrustedPage(chromium.replace('[1]', '%5B1%5D'), expected, 'win32'), true)
  assert.equal(isTrustedPage(chromium.replace('/C:/', '/c:/'), expected, 'win32'), true)
})

test('trust remains limited to the exact bundled page', () => {
  const expected = String.raw`C:\App\resources\app.asar\dist-desktop\index.html`
  const good = 'file:///C:/App/resources/app.asar/dist-desktop/index.html'
  for (const url of [good + '?remote=1', good + '#fragment', good.replace('index.html', 'other.html'), 'https://example.com/index.html', 'file:///C:/App/resources/app.asar/dist-desktop/../index.html', 'file://server/App/resources/app.asar/dist-desktop/index.html', 'not a url']) {
    assert.equal(isTrustedPage(url, expected, 'win32'), false, url)
  }
})

test('POSIX comparison preserves case and handles bracket encoding', () => {
  assert.equal(isTrustedPage('file:///tmp/QR[1]/index.html', '/tmp/QR[1]/index.html', 'linux'), true)
  assert.equal(isTrustedPage('file:///tmp/QR%5B1%5D/index.html', '/tmp/QR[1]/index.html', 'linux'), true)
  assert.equal(isTrustedPage('file:///tmp/qr[1]/index.html', '/tmp/QR[1]/index.html', 'linux'), false)
})
