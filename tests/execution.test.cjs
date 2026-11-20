const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { ExecutionBridge } = require('../desktop/execution/bridge.cjs')
const { runSSH } = require('../desktop/execution/ssh.cjs')
const { sign, verify, sessionId, encodeQR, MAX_OUTPUT } = require('../desktop/execution/protocol.cjs')
const key = 'a'.repeat(64)
const flush = () => new Promise(setImmediate)
function pair(t, execute = async () => ({ state: 'completed', stdout: 'hello', stderr: '', exitCode: 0 })) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qrbridge-exec-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  let now = 1000000, clipboard = '', calls = 0
  const senderDir = path.join(root, 'sender'), receiverDir = path.join(root, 'receiver')
  const sender = new ExecutionBridge(senderDir, { now: () => now, execute: async (...args) => { calls++; return execute(...args) } })
  const receiver = new ExecutionBridge(receiverDir, { now: () => now })
  sender.configure({ role: 'sender', key, targets: ['dev-server'] }); receiver.configure({ role: 'receiver', key })
  sender.start(); receiver.start()
  const pump = () => {
    now += 1000
    receiver.tick({ writeText: t => { clipboard = t } })
    sender.tick({ readText: () => clipboard })
  }
  const scan = () => {
    const chunks = [...(sender.transfer?.chunks ?? [])]
    for (const chunk of chunks.reverse()) { receiver.receiveQR(chunk); receiver.receiveQR(chunk) }
    pump()
  }
  scan() // handshake
  return { sender, receiver, senderDir, receiverDir, pump, scan, calls: () => calls, advance: ms => { now += ms }, raw: () => clipboard }
}
test('one-way clipboard round trip, missing QR replay, deduplication and sequential tasks', async t => {
  const p = pair(t, async () => ({ state: 'completed', stdout: '汉字'.repeat(1500), stderr: 'warning', exitCode: 7 }))
  assert.deepEqual(p.receiver.targets, ['dev-server'])
  const first = p.receiver.submit({ requestId: 'stable-1', target: 'dev-server', command: 'echo hello' })
  assert.equal(first.state, 'queued'); p.pump(); p.pump(); await flush()
  assert.equal(p.calls(), 1)
  assert.throws(() => p.sender.stop(), /task/)
  p.scan() // receipt
  const transfer = p.sender.transfer
  assert.ok(transfer.chunks.length > 2)
  for (let i = 0; i < transfer.chunks.length; i++) if (i !== 1) p.receiver.receiveQR(transfer.chunks[i])
  p.pump(); assert.deepEqual(p.sender.transfer.missing, [2])
  assert.notEqual(p.receiver.status(first.jobId).state, 'completed')
  p.receiver.receiveQR(transfer.chunks[1]); p.pump()
  assert.equal(p.receiver.status(first.jobId).stdout, '汉字'.repeat(1500))
  assert.equal(p.receiver.status(first.jobId).exitCode, 7)
  assert.equal(p.sender.busy, false)
  assert.equal(p.receiver.submit({ requestId: 'stable-1', target: 'dev-server', command: 'echo hello' }).state, 'completed')
  p.receiver.submit({ target: 'dev-server', command: 'pwd' }); p.pump(); await flush(); p.scan(); p.scan()
  assert.equal(p.calls(), 2); assert.equal(p.receiver.busy, false)
  p.sender.stop(); p.receiver.stop()
})
test('file mode never reads requests or executes; pairing, direction and tampering are checked', async t => {
  const p = pair(t)
  const request = { jobId: 'x', command: 'id', target: 'dev-server', timeoutMs: 1000, expiresAt: 1100000 }
  const message = { sessionId: sessionId(key), at: 1000000, request }
  const text = sign(message, key, 'request')
  assert.equal(verify(text, key, 'result'), null)
  assert.equal(verify(text, 'b'.repeat(64), 'request'), null)
  assert.equal(verify(text.replace('payload', 'broken'), key, 'request'), null)
  p.sender.stop()
  p.sender.tick({ readText: () => { throw new Error('File mode must not read') } })
  await flush(); assert.equal(p.calls(), 0)
  p.sender.start()
  p.sender.tick({ readText: () => sign(message, 'b'.repeat(64), 'request') })
  await flush(); assert.equal(p.calls(), 0)
})
test('restart preserves completed results and records in-flight work as unknown without rerunning', async t => {
  const p = pair(t, () => new Promise(() => {}))
  const job = p.receiver.submit({ target: 'dev-server', command: 'sleep 30' }); p.pump(); await flush()
  assert.equal(p.calls(), 1)
  const recovered = new ExecutionBridge(p.senderDir, { execute: () => { throw new Error('Must not rerun') }, now: () => 1005000 })
  recovered.start()
  recovered.tick({ readText: p.raw })
  assert.equal(recovered.status(job.jobId).state, 'unknown')
  assert.equal(recovered.status(job.jobId).delivered, false)
})
test('lost receipt becomes unknown, expired requests do not execute, unknown target fails visibly', async t => {
  const p = pair(t)
  const job = p.receiver.submit({ target: 'dev-server', command: 'id' })
  p.advance(121000); p.pump(); await flush()
  assert.equal(p.calls(), 0); assert.equal(p.receiver.status(job.jobId).state, 'unknown')
  assert.throws(() => p.receiver.submit({ target: 'missing', command: 'id' }), /Target/)
  p.sender.acceptRequest({ jobId: 'missing', target: 'missing', command: 'id', timeoutMs: 1000, expiresAt: 1200000 })
  assert.equal(p.sender.status('missing').state, 'failed')
})
test('receiver restart recovers target handshake and persisted result', async t => {
  const p = pair(t)
  const job = p.receiver.submit({ target: 'dev-server', command: 'id' }); p.pump(); await flush(); p.scan(); p.scan()
  const receiver = new ExecutionBridge(p.receiverDir, { now: () => 1010000 }); receiver.start()
  let text
  receiver.tick({ writeText: value => { text = value } })
  p.sender.tick({ readText: () => text })
  assert.equal(p.sender.transfer.message.type, 'hello')
  for (const chunk of p.sender.transfer.chunks) receiver.receiveQR(chunk)
  assert.deepEqual(receiver.targets, ['dev-server'])
  assert.equal(receiver.status(job.jobId).stdout, 'hello')
})
test('tampered results never update task state or acknowledge completion', t => {
  const p = pair(t)
  const transfer = encodeQR({ sessionId: sessionId(key), type: 'hello', targets: ['evil'] }, 'b'.repeat(64))
  assert.throws(() => transfer.chunks.forEach(chunk => p.receiver.receiveQR(chunk)), /authentication/)
  assert.deepEqual(p.receiver.targets, ['dev-server']); assert.equal(p.receiver.ack, null)
})
test('SSH uses an argument array without local shell, bounds output and preserves exit status', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
  let invocation
  const resultPromise = runSSH('dev-server', { command: 'echo "$(id)"; whoami', timeoutMs: 1000 }, (...args) => { invocation = args; return child })
  child.stdout.emit('data', Buffer.alloc(MAX_OUTPUT + 100, 'a')); child.stderr.emit('data', Buffer.from('ignored'))
  child.emit('close', 9, null)
  const result = await resultPromise
  assert.equal(invocation[2].shell, false); assert.equal(invocation[1].at(-1), 'echo "$(id)"; whoami')
  assert.ok(invocation[1].includes('StrictHostKeyChecking=yes'))
  assert.equal(result.stdout.length, MAX_OUTPUT); assert.equal(result.truncated, true); assert.equal(result.exitCode, 9)
})
test('SSH timeout reports unknown instead of claiming remote cancellation', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); let killed = false; child.kill = () => { killed = true }
  const result = await runSSH('host', { command: 'sleep 5', timeoutMs: 5 }, () => child)
  assert.equal(result.state, 'unknown'); assert.equal(killed, true)
})
test('maximum control-character output fits authenticated QR transport', () => {
  const value = { sessionId: sessionId(key), stdout: '\0'.repeat(MAX_OUTPUT) }
  const qr = encodeQR(value, key)
  const raw = qr.chunks.map(c => c.slice(c.indexOf(']') + 1)).join('')
  assert.deepEqual(verify(raw, key, 'result'), value)
})

test('lost final results eventually become unknown, but late authenticated results recover them', async t => {
  const p = pair(t)
  const job = p.receiver.submit({ target: 'dev-server', command: 'id' })
  p.pump(); await flush(); p.scan()
  assert.equal(p.receiver.status(job.jobId).state, 'accepted')
  p.advance(300000); p.pump()
  assert.equal(p.receiver.status(job.jobId).state, 'unknown')
  p.scan()
  assert.equal(p.receiver.status(job.jobId).state, 'completed')
  assert.equal(p.calls(), 1)
})

test('receiver restart during partial result resets sender playback to all chunks', async t => {
  const p = pair(t, async () => ({ state: 'completed', stdout: 'a'.repeat(3000), stderr: '', exitCode: 0 }))
  const job = p.receiver.submit({ target: 'dev-server', command: 'id' }); p.pump(); await flush(); p.scan()
  const old = p.sender.transfer
  for (const chunk of old.chunks.slice(0, -1)) p.receiver.receiveQR(chunk)
  p.pump(); assert.deepEqual(p.sender.transfer.missing, [old.chunks.length])
  const receiver = new ExecutionBridge(p.receiverDir, { now: () => 1010000 }); receiver.start()
  let text
  receiver.tick({ writeText: value => { text = value } }); p.sender.tick({ readText: () => text })
  assert.notEqual(p.sender.transfer.id, old.id)
  assert.equal(p.sender.transfer.missing, null)
  for (const chunk of p.sender.transfer.chunks) receiver.receiveQR(chunk)
  assert.equal(receiver.status(job.jobId).stdout, 'a'.repeat(3000))
  assert.equal(p.calls(), 1)
})

test('first-run QR pairing confirms both peers and survives a restart', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qrbridge-pairing-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const senderDir = path.join(root, 'sender'), receiverDir = path.join(root, 'receiver')
  const sender = new ExecutionBridge(senderDir, { execute: async () => ({ state: 'completed' }) })
  const receiver = new ExecutionBridge(receiverDir)
  sender.configure({ role: 'sender', targets: ['dev-server'] })
  sender.start(); receiver.start()
  const code = sender.snapshot().pairingCode
  assert.ok(code)
  assert.equal(sender.snapshot().peerVerified, false)
  receiver.receiveQR(code)
  assert.equal(receiver.snapshot().pairingScanned, true)
  assert.equal(receiver.snapshot().peerVerified, false)
  assert.throws(() => receiver.submit({ target: 'dev-server', command: 'hostname' }), /Target/)

  let clipboard
  receiver.tick({ writeText: value => { clipboard = value } })
  sender.tick({ readText: () => clipboard })
  assert.equal(sender.snapshot().pairingCode, null)
  assert.equal(sender.snapshot().peerVerified, true)
  for (const chunk of sender.transfer.chunks) receiver.receiveQR(chunk)
  assert.equal(receiver.snapshot().peerVerified, true)
  const job = receiver.submit({ target: 'dev-server', command: 'hostname' })
  receiver.lastWrite = 0
  receiver.tick({ writeText: value => { clipboard = value } })
  sender.tick({ readText: () => clipboard })
  await flush()
  assert.equal(sender.status(job.jobId).state, 'completed')

  const restartedSender = new ExecutionBridge(senderDir)
  const restartedReceiver = new ExecutionBridge(receiverDir)
  restartedSender.start(); restartedReceiver.start()
  assert.equal(restartedSender.snapshot().pairingCode, null)
  for (const chunk of restartedSender.transfer.chunks) restartedReceiver.receiveQR(chunk)
  assert.equal(restartedReceiver.snapshot().peerVerified, true)
})

test('direct SSH addresses travel from the allowlist through the handshake and command request', async t => {
  const destinations = ['192.168.1.20', 'alice@ssh.example.com', 'alice@[2001:db8::20]']
  let executedTarget
  const p = pair(t, async target => {
    executedTarget = target
    return { state: 'completed' }
  })
  p.sender.stop(); p.receiver.stop()
  for (const invalid of ['alice@', 'ssh://example.com', '192.168.1.999', 'host -oProxyCommand=x']) {
    assert.throws(() => p.sender.configure({ targets: [invalid] }), /Invalid settings/)
  }
  p.sender.configure({ targets: destinations })
  p.sender.start(); p.receiver.start()
  p.scan()
  assert.deepEqual(p.receiver.targets, destinations)
  p.receiver.submit({ target: destinations[2], command: 'hostname' })
  p.pump(); await flush()
  assert.equal(executedTarget, destinations[2])

  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
  const result = runSSH(executedTarget, { command: 'hostname', timeoutMs: 1000 }, (file, args) => {
    assert.equal(file, 'ssh')
    assert.deepEqual(args.slice(-3), ['--', 'alice@2001:db8::20', 'hostname'])
    return child
  })
  child.emit('close', 0, null)
  assert.equal((await result).state, 'completed')
})
