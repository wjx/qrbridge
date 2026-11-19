const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { findCachedElectron, buildArgs } = require('../scripts/build-exe.cjs')

test('matches Windows x64 archive for the installed Electron version only', t => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'qrbridge-cache-'))
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }))
  assert.equal(findCachedElectron(path.join(cache, 'missing'), '45.4.1'), null)
  fs.mkdirSync(path.join(cache, 'hash'))
  for (const name of ['electron-v45.4.0-win32-x64.zip', 'electron-v45.4.1-linux-x64.zip']) {
    fs.writeFileSync(path.join(cache, 'hash', name), 'archive')
  }
  assert.equal(findCachedElectron(cache, '45.4.1'), null)
  const archive = path.join(cache, 'hash', 'electron-v45.4.1-win32-x64.zip')
  fs.writeFileSync(archive, 'archive')
  assert.equal(findCachedElectron(cache, '45.4.1'), archive)
})

test('Linux portable build avoids Wine and preserves paths with spaces', () => {
  const args = buildArgs('/tmp/cache with spaces/electron.zip', 'linux')
  assert.ok(args.includes('portable'))
  assert.ok(args.includes('-c.win.signAndEditExecutable=false'))
  assert.ok(args.includes('-c.electronDist=/tmp/cache with spaces/electron.zip'))
  assert.ok(!args.includes('--prepackaged'))
  assert.ok(!buildArgs(null, 'win32').some(arg => arg.includes('signAndEditExecutable')))
  assert.ok(!buildArgs(null).some(arg => arg.includes('electronDist')))
})
