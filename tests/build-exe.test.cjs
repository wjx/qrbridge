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

const { selectPnpm } = require('../scripts/build-exe.cjs')
test('old pnpm switches to verified project version before installation', () => {
  const calls = []
  const runner = selectPnpm('10.25.0', (command, args) => {
    calls.push([command, args])
    return { status: 0, stdout: command === 'pnpm' ? '8.15.4\n' : '10.25.0\n' }
  }, 'linux')
  assert.deepEqual(calls, [
    ['pnpm', ['--version']],
    ['npx', ['--yes', '--package=pnpm@10.25.0', '--', 'pnpm', '--version']],
  ])
  assert.equal(runner.command, 'npx')
  assert.deepEqual(runner.prefix, ['--yes', '--package=pnpm@10.25.0', '--', 'pnpm'])
})

test('matching pnpm runs without bootstrap or network access', () => {
  let count = 0
  assert.deepEqual(selectPnpm('10.25.0', () => {
    count++
    return { status: 0, stdout: '10.25.0\n' }
  }, 'linux'), { command: 'pnpm', prefix: [] })
  assert.equal(count, 1)
})

test('missing pnpm can bootstrap, but failed or incorrect bootstrap aborts before install', () => {
  const missing = { status: null, error: new Error('ENOENT') }
  assert.equal(selectPnpm('10.25.0', command => command === 'pnpm' ? missing :
    { status: 0, stdout: '10.25.0' }, 'linux').command, 'npx')
  for (const failure of [missing, { status: 1, stderr: 'network unavailable' }, { status: 0, stdout: '8.15.4' }]) {
    assert.throws(() => selectPnpm('10.25.0', command => command === 'pnpm' ? missing : failure, 'linux'),
      /Cannot start pnpm 10.25.0/)
  }
})
