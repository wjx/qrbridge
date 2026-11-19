#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')

// Electron's cache stores each download under a URL hash. Match the installed
// version and Windows architecture, never a stale archive from another release.
function findCachedElectron(cacheDir, version) {
  const filename = `electron-v${version}-win32-x64.zip`
  if (!fs.existsSync(cacheDir)) return null
  const candidates = [
    path.join(cacheDir, filename),
    ...fs.readdirSync(cacheDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(cacheDir, entry.name, filename)),
  ]
  return candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null
}

function buildArgs(cachedElectron, platform = process.platform) {
  const args = ['exec', 'electron-builder', '--config', 'electron-builder.yml',
    '--win', 'portable', '--x64', '--publish', 'never']
  if (platform !== 'win32') args.push('-c.win.signAndEditExecutable=false')
  if (cachedElectron) args.push(`-c.electronDist=${cachedElectron}`)
  return args
}

// Resolve and verify the package manager before any install can touch node_modules.
function selectPnpm(requiredVersion, probe, platform = process.platform) {
  const pnpm = platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const current = probe(pnpm, ['--version'])
  if (current.status === 0 && current.stdout?.trim() === requiredVersion) {
    return { command: pnpm, prefix: [] }
  }
  const command = platform === 'win32' ? 'npx.cmd' : 'npx'
  const prefix = ['--yes', `--package=pnpm@${requiredVersion}`, '--', 'pnpm']
  const selected = probe(command, [...prefix, '--version'])
  if (selected.error || selected.status !== 0 || selected.stdout?.trim() !== requiredVersion) {
    throw new Error(`Cannot start pnpm ${requiredVersion}. Check npm/npx and network access. No dependencies were installed. ${selected.stderr?.trim() || selected.error?.message || ''}`)
  }
  return { command, prefix }
}

function main() {
  const requiredVersion = require('../package.json').packageManager.replace(/^pnpm@/, '')
  const runner = selectPnpm(requiredVersion, (command, args) => spawnSync(command, args, {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
  }))
  console.log(`Building with pnpm ${requiredVersion}`)
  function run(args) {
    const result = spawnSync(runner.command, [...runner.prefix, ...args], {
      cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    })
    if (result.error) throw new Error(`Unable to run pnpm: ${result.error.message}. Install Node.js and npm first.`)
    if (result.status !== 0) throw new Error(`pnpm ${args[0]} failed (${result.signal || result.status}).`)
  }

  run(['install', '--frozen-lockfile'])
  run(['desktop:build'])

  const version = require(path.join(root, 'node_modules/electron/package.json')).version
  const cacheDir = process.env.electron_config_cache ||
    (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'electron')
        : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'electron'))
  const archive = process.env.QRBRIDGE_ELECTRON_ZIP
    ? path.resolve(process.env.QRBRIDGE_ELECTRON_ZIP)
    : findCachedElectron(cacheDir, version)
  if (archive && !fs.existsSync(archive)) throw new Error(`Electron archive not found: ${archive}`)
  console.log(archive ? `Using Electron archive: ${archive}` : 'No matching Electron cache found; electron-builder will download it.')
  // Always package the fresh desktop build; do not use --prepackaged.
  run(buildArgs(archive))
  const appVersion = require('../package.json').version
  const output = path.join(root, 'release', `QRBridge-Portable-${appVersion}-x64.exe`)
  if (!fs.existsSync(output)) throw new Error(`Build finished without expected output: ${output}`)
  console.log(`\nEXE ready: ${output}`)
}

if (require.main === module) {
  try { main() } catch (error) {
    console.error(`\nEXE build failed: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { findCachedElectron, buildArgs, selectPnpm }
