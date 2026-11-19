const path = require('node:path')
const { fileURLToPath } = require('node:url')

// Chromium and Node serialize file URLs differently (e.g. [ ] vs %5B %5D).
// Compare decoded, normalized filesystem paths, never file:// origins.
function isTrustedPage(url, expectedPath, platform = process.platform) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) return false
    const windows = platform === 'win32'
    const paths = windows ? path.win32 : path.posix
    const actual = paths.normalize(fileURLToPath(parsed, { windows }))
    const expected = paths.normalize(expectedPath)
    return windows ? actual.toLowerCase() === expected.toLowerCase() : actual === expected
  } catch {
    return false
  }
}

module.exports = { isTrustedPage }
