const fs = require('node:fs')
const path = require('node:path')
const { randomBytes, randomUUID } = require('node:crypto')
const { sign, verify, sessionId, encodeQR, parseQR, parseTarget, validateRequest, terminal } = require('./protocol.cjs')
const { runSSH } = require('./ssh.cjs')
const PAIRING_PREFIX = 'QREX-PAIR1:'
const PAIRING_CODE = /^QREX-PAIR1:([a-f0-9]{64}):([a-f0-9-]{36})$/

class ExecutionBridge {
  constructor(directory, { execute = runSSH, now = Date.now } = {}) {
    this.file = path.join(directory, 'execution.json')
    this.execute = execute; this.now = now; this.active = false; this.error = ''
    this.config = { role: 'receiver', key: randomBytes(32).toString('hex'), targets: [], port: 3210, token: randomBytes(32).toString('hex') }
    this.paired = false
    this.jobs = new Map()
    if (fs.existsSync(this.file)) {
      const stored = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (stored.version !== 1 || !Array.isArray(stored.jobs)) throw new Error('Invalid execution journal; refusing to execute')
      this.config = this.validateConfig(stored.config)
      this.jobs = new Map(stored.jobs.map(job => [job.storageId, job]))
      this.paired = stored.paired ?? (this.localJobs.length > 0)
      for (const job of this.jobs.values()) {
        if (job.role === 'sender' && !terminal(job.state)) {
          job.state = 'unknown'; job.error = 'Sender restarted; execution outcome is unknown. Do not automatically retry.'
        }
      }
    }
    this.save()
    this.resetTransport()
  }
  validateConfig(config) {
    if (!config || !['sender', 'receiver'].includes(config.role) || !/^[a-f0-9]{64}$/.test(config.key) ||
      !/^[a-f0-9]{64}$/.test(config.token) || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      !Array.isArray(config.targets) || config.targets.length > 32 || config.targets.some(t => !parseTarget(t)) ||
      new Set(config.targets).size !== config.targets.length) throw new Error('Invalid settings: use a 64-character hexadecimal pairing key, SSH targets, and port 1024–65535')
    return { role: config.role, key: config.key, targets: [...config.targets], port: config.port, token: config.token }
  }
  configure(config) {
    if (this.active) throw new Error('Leave execution mode before changing settings')
    const next = this.validateConfig({ ...this.config, ...config })
    const paired = config.key !== undefined || (next.role === this.config.role && this.paired)
    this.savePairing(next, paired)
    return this.snapshot()
  }
  savePairing(config, paired) {
    const previous = this.config, wasPaired = this.paired
    this.config = config
    this.paired = paired
    try { this.save() }
    catch (error) { this.config = previous; this.paired = wasPaired; throw error }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = this.file + '.tmp'
    const fd = fs.openSync(temp, 'w', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify({ version: 1, config: this.config, paired: this.paired, jobs: [...this.jobs.values()] })); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temp, this.file)
  }
  resetTransport() {
    this.pairingNonce = null; this.peerVerified = false
    this.outbox = []; this.transfer = null; this.incoming = null; this.ack = null; this.targets = []; this.receiverEpoch = randomUUID(); this.lastReceiverEpoch = null; this.lastWrite = 0
  }
  get sid() { return sessionId(this.config.key) }
  get localJobs() { return [...this.jobs.values()].filter(j => j.sessionId === this.sid && j.role === this.config.role) }
  get pending() { return this.localJobs.find(j => !terminal(j.state)) }
  get busy() { return Boolean(this.pending || (this.config.role === 'sender' && this.localJobs.some(j => !j.delivered))) }
  start() {
    if (this.active) return
    this.resetTransport(); this.error = ''; this.active = true
    if (this.config.role === 'sender') {
      if (!this.paired) this.pairingNonce = randomUUID()
      this.enqueue({ type: 'hello', targets: this.config.targets })
      for (const job of this.localJobs.filter(j => !j.delivered)) this.publish(job)
    }
  }
  stop() {
    if (this.busy) throw new Error('A task is running, unresolved, or awaiting result acknowledgement. Keep execution mode open until its result arrives.')
    this.active = false; this.resetTransport()
  }
  publicJob(job) {
    if (!job) return null
    const { storageId, role, sessionId: ignored, ...result } = job
    return result
  }
  snapshot() {
    return { active: this.active, busy: this.busy, config: this.config, error: this.error,
      peerVerified: this.peerVerified, pairingScanned: this.config.role === 'receiver' && Boolean(this.pairingNonce),
      pairingCode: this.active && this.config.role === 'sender' && this.pairingNonce
        ? PAIRING_PREFIX + this.config.key + ':' + this.pairingNonce : null,
      targets: this.config.role === 'sender' ? this.config.targets : this.targets,
      jobs: this.localJobs.slice(-30).reverse().map(j => this.publicJob(j)),
      transfer: this.transfer ? { id: this.transfer.id, chunks: this.transfer.chunks, missing: this.transfer.missing } : null,
      receiving: this.incoming ? { received: this.incoming.parts.size, total: this.incoming.total } : null }
  }
  enqueue(message) {
    // At most one revision per job may wait behind the currently displayed revision.
    if (message.job) this.outbox = this.outbox.filter(m => m.job?.jobId !== message.job.jobId)
    this.outbox.push(message); this.advance()
  }
  advance() {
    if (this.transfer || !this.outbox.length) return
    const message = this.outbox.shift()
    this.transfer = { ...encodeQR({ sessionId: this.sid, ...message }, this.config.key), message, missing: null }
  }
  publish(job) {
    const publicJob = this.publicJob(job)
    if (this.transfer?.message.job?.jobId === job.jobId && this.transfer.message.job.state === job.state) return
    this.enqueue({ type: 'job', job: publicJob })
  }
  submit(args = {}) {
    if (!this.active || this.config.role !== 'receiver') throw new Error('Receiver execution mode is not active')
    const request = validateRequest({ jobId: args.requestId ?? randomUUID(), target: args.target, command: args.command, timeoutMs: args.timeoutMs ?? 30000, expiresAt: this.now() + 120000 })
    const storageId = `${this.sid}:receiver:${request.jobId}`
    const previous = this.jobs.get(storageId)
    if (previous) {
      if (previous.command !== request.command || previous.target !== request.target || previous.timeoutMs !== request.timeoutMs) throw new Error('requestId already belongs to a different command')
      return this.publicJob(previous)
    }
    if (this.pending) throw new Error('Another task is pending; query ssh_status before submitting a new task')
    if (!this.targets.includes(request.target)) throw new Error('Target unavailable. Scan the sender handshake QR codes first.')
    if (this.jobs.size >= 1000) throw new Error('Task journal is full; archive it while the app is closed before creating a new pairing')
    const job = { ...request, storageId, sessionId: this.sid, role: 'receiver', state: 'queued', createdAt: this.now() }
    this.jobs.set(storageId, job); this.save(); return this.publicJob(job)
  }
  status(jobId) {
    const job = this.jobs.get(`${this.sid}:${this.config.role}:${jobId}`)
    if (!job) throw new Error('Unknown job ID')
    return this.publicJob(job)
  }
  tick(clipboard) {
    if (!this.active) return
    try {
      if (this.config.role === 'sender') {
        const message = verify(clipboard.readText(), this.config.key, 'request')
        if (!message || !Number.isSafeInteger(message.at) || Math.abs(this.now() - message.at) > 120000) return
        if (typeof message.receiverEpoch !== 'string' || !/^[a-f0-9-]{36}$/.test(message.receiverEpoch)) return
        if (this.pairingNonce) {
          if (message.pairingNonce !== this.pairingNonce) return
          this.savePairing(this.config, true)
          this.pairingNonce = null
          this.peerVerified = true
          return
        }
        this.peerVerified = true
        if (this.lastReceiverEpoch && this.lastReceiverEpoch !== message.receiverEpoch && this.transfer) {
          // A restarted receiver has lost its partial chunk buffer. Start a new
          // transfer ID so playback includes every chunk, not just old missing ones.
          const current = this.transfer.message
          this.transfer = { ...encodeQR({ sessionId: this.sid, ...current }, this.config.key), message: current, missing: null }
        }
        this.lastReceiverEpoch = message.receiverEpoch
        this.acceptAck(message.ack)
        if (message.helloRequested && this.transfer?.message.type !== 'hello' && !this.outbox.some(m => m.type === 'hello')) this.enqueue({ type: 'hello', targets: this.config.targets })
        if (message.request) this.acceptRequest(message.request)
      } else {
        const job = this.pending
        if (job && this.now() > job.expiresAt + (job.state === 'queued' ? 0 : job.timeoutMs + 120000)) {
          // The request may have arrived while the receipt QR was lost.
          job.state = 'unknown'; job.error = 'No confirmed result before delivery deadline; command may have executed or may still be running. Keep scanning for its result.'; this.save()
        }
        // Querying the same ID also recovers cached results after QR/clipboard loss.
        const latest = this.localJobs.at(-1)
        const request = latest && (!terminal(latest.state) || latest.state === 'unknown') ? validateRequest(latest) : null
        const text = sign({ sessionId: this.sid, at: this.now(), receiverEpoch: this.receiverEpoch, pairingNonce: this.pairingNonce ?? undefined, helloRequested: !this.targets.length, request, ack: this.ack }, this.config.key, 'request')
        if (this.now() - this.lastWrite >= 750) { clipboard.writeText(text); this.lastWrite = this.now() }
      }
    } catch (error) { this.error = error.message }
  }
  acceptAck(ack) {
    const transfer = this.transfer
    if (!transfer || !ack || ack.id !== transfer.id || ack.total !== transfer.chunks.length || !Array.isArray(ack.missing) ||
      ack.missing.length > ack.total || new Set(ack.missing).size !== ack.missing.length ||
      ack.missing.some(n => !Number.isInteger(n) || n < 1 || n > ack.total)) return
    // Ignore older progress, including delayed clipboard sync.
    if (transfer.missing && ack.missing.some(n => !transfer.missing.includes(n))) return
    transfer.missing = ack.missing
    if (ack.missing.length) return
    const result = transfer.message.job
    if (result && terminal(result.state)) {
      const job = this.jobs.get(`${this.sid}:sender:${result.jobId}`)
      if (job && job.state === result.state) { job.delivered = true; this.save() }
    }
    this.transfer = null; this.advance()
  }
  acceptRequest(raw) {
    const request = validateRequest(raw)
    const storageId = `${this.sid}:sender:${request.jobId}`
    const previous = this.jobs.get(storageId)
    if (previous) {
      if (previous.target !== request.target || previous.command !== request.command || previous.timeoutMs !== request.timeoutMs) throw new Error('Conflicting task ID rejected')
      // Do not endlessly retransmit a result that was already acknowledged.
      if (!previous.delivered) this.publish(previous)
      return
    }
    if (request.expiresAt < this.now() || request.expiresAt > this.now() + 180000) return
    if (this.busy) return
    if (this.jobs.size >= 1000) throw new Error('Task journal is full')
    const job = { ...request, storageId, sessionId: this.sid, role: 'sender', state: 'accepted', createdAt: this.now(), delivered: false }
    this.jobs.set(storageId, job)
    // Persist BEFORE spawning SSH. If persistence fails, fail closed.
    try { this.save() } catch (error) { this.jobs.delete(storageId); throw error }
    this.publish(job)
    if (!this.config.targets.includes(request.target)) {
      Object.assign(job, { state: 'failed', error: 'Target is not configured on sender', exitCode: null }); this.save(); this.publish(job); return
    }
    job.state = 'running'; this.save()
    Promise.resolve().then(() => this.execute(request.target, request)).then(result => {
      Object.assign(job, result); this.save(); this.publish(job)
    }).catch(error => {
      job.state = 'unknown'; job.error = error.message
      try { this.save(); this.publish(job) } catch (failure) { this.error = failure.message }
    })
  }
  receiveQR(raw) {
    if (!this.active || this.config.role !== 'receiver') return
    if (typeof raw === 'string' && raw.startsWith(PAIRING_PREFIX)) {
      const offer = PAIRING_CODE.exec(raw)
      if (!offer || offer[0] !== raw || this.peerVerified) return
      const [, key, nonce] = offer
      if (key !== this.config.key) {
        if (this.paired || this.pairingNonce || this.busy) return
        this.savePairing({ ...this.config, key }, false)
      }
      this.pairingNonce = nonce
      this.incoming = null
      this.ack = null
      return
    }
    const chunk = parseQR(raw)
    if (!chunk) return
    if (this.ack?.id === chunk.id && this.ack.missing.length === 0) return
    if (!this.incoming || this.incoming.id !== chunk.id) this.incoming = { id: chunk.id, total: chunk.total, parts: new Map() }
    const incoming = this.incoming
    if (incoming.total !== chunk.total) throw new Error('Conflicting QR chunk count')
    const existing = incoming.parts.get(chunk.index)
    if (existing && existing !== chunk.content) throw new Error('Conflicting QR chunk content')
    incoming.parts.set(chunk.index, chunk.content)
    const missing = Array.from({ length: chunk.total }, (_, i) => i + 1).filter(i => !incoming.parts.has(i))
    if (!missing.length) {
      const text = Array.from({ length: chunk.total }, (_, i) => incoming.parts.get(i + 1)).join('')
      const message = verify(text, this.config.key, 'result')
      if (!message) { this.incoming = null; this.ack = null; throw new Error('Result authentication failed. Check the pairing key on both devices.') }
      if (message.type === 'hello' && Array.isArray(message.targets) && message.targets.length <= 32 && message.targets.every(parseTarget)) {
        if (!this.paired) this.savePairing(this.config, true)
        this.pairingNonce = null
        this.peerVerified = true
        this.targets = message.targets
      } else if (message.type === 'job') {
        const result = message.job
        const job = result && this.jobs.get(`${this.sid}:receiver:${result.jobId}`)
        if (!job || job.command !== result.command || job.target !== result.target ||
          !['accepted', 'running', 'completed', 'failed', 'unknown', 'expired'].includes(result.state) ||
          ['stdout', 'stderr', 'error'].some(k => result[k] !== undefined && typeof result[k] !== 'string')) throw new Error('Unexpected task result')
        if (!terminal(job.state) || job.state === 'unknown') {
          for (const key of ['state', 'stdout', 'stderr', 'exitCode', 'truncated', 'error']) {
            if (result[key] !== undefined) job[key] = result[key]
            else delete job[key]
          }
          this.save()
        }
      } else throw new Error('Invalid execution message')
    }
    this.ack = { id: chunk.id, total: chunk.total, missing }
  }
}
module.exports = { ExecutionBridge }
