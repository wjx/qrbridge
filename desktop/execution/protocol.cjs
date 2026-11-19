const { createHmac, timingSafeEqual, randomUUID, createHash } = require('node:crypto')
const PREFIX = 'QREX1:'
const MAX_CHUNKS = 1024
const MAX_OUTPUT = 32 * 1024
function sessionId(key) { return createHash('sha256').update(key).digest('hex').slice(0, 32) }
function sign(value, key, direction) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64')
  const mac = createHmac('sha256', key).update(direction + ':' + payload).digest('hex')
  return PREFIX + JSON.stringify({ payload, mac })
}
function verify(text, key, direction) {
  if (typeof text !== 'string' || text.length > 400000 || !text.startsWith(PREFIX)) return null
  try {
    const { payload, mac } = JSON.parse(text.slice(PREFIX.length))
    if (typeof payload !== 'string' || typeof mac !== 'string' || !/^[a-f0-9]{64}$/.test(mac)) return null
    const expected = createHmac('sha256', key).update(direction + ':' + payload).digest()
    if (!timingSafeEqual(expected, Buffer.from(mac, 'hex'))) return null
    const value = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    return value && value.sessionId === sessionId(key) ? value : null
  } catch { return null }
}
function encodeQR(value, key) {
  const text = sign(value, key, 'result')
  const id = randomUUID()
  const total = Math.ceil(text.length / 450)
  if (total > MAX_CHUNKS) throw new Error('Result exceeds QR transport limit')
  return { id, chunks: Array.from({ length: total }, (_, i) => `[QREX1:${id}:${i + 1}/${total}]${text.slice(i * 450, (i + 1) * 450)}`) }
}
function parseQR(raw) {
  if (typeof raw !== 'string' || raw.length > 520) return null
  const match = raw.match(/^\[QREX1:([a-f0-9-]{36}):(\d+)\/(\d+)\]([\s\S]+)$/)
  if (!match) return null
  const index = Number(match[2]), total = Number(match[3])
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total || total > MAX_CHUNKS || match[4].length > 450) return null
  return { id: match[1], index, total, content: match[4] }
}
function validateRequest(value) {
  if (!value || typeof value.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.jobId) ||
    typeof value.target !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.target) ||
    typeof value.command !== 'string' || !value.command.trim() || value.command.length > 8000 || value.command.includes('\0') ||
    !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1000 || value.timeoutMs > 300000 ||
    !Number.isSafeInteger(value.expiresAt)) throw new Error('Invalid execution request')
  return { jobId: value.jobId, target: value.target, command: value.command, timeoutMs: value.timeoutMs, expiresAt: value.expiresAt }
}
const terminal = state => ['completed', 'failed', 'unknown', 'expired'].includes(state)
module.exports = { sessionId, sign, verify, encodeQR, parseQR, validateRequest, terminal, MAX_OUTPUT }
