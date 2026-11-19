const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const target = path.join(root, 'desktop-app')
const pkg = require('../package.json')
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
fs.cpSync(path.join(root, 'dist-desktop'), path.join(target, 'dist-desktop'), { recursive: true })
fs.mkdirSync(path.join(target, 'desktop'))
for (const file of ['main.cjs', 'mcp-bundle.cjs', 'trusted-page.cjs', 'main-preload.cjs', 'picker.html', 'picker.js', 'picker-preload.cjs']) {
  fs.copyFileSync(path.join(root, 'desktop', file), path.join(target, 'desktop', file))
}
fs.cpSync(path.join(root, 'desktop/execution'), path.join(target, 'desktop/execution'), { recursive: true })
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
  name: 'qrbridge-desktop', productName: 'QR Bridge', version: pkg.version,
  description: 'Offline screen QR scanner', author: 'QR Bridge contributors', main: 'desktop/main.cjs',
}, null, 2))
