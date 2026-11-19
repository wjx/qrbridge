const { spawn } = require('node:child_process')
const { MAX_OUTPUT } = require('./protocol.cjs')
// OpenSSH reads host/user/key/known_hosts from the sender's own SSH config.
// shell:false keeps the requested remote command out of the local shell.
function runSSH(target, request, spawnProcess = spawn) {
  return new Promise(resolve => {
    let child, timer, settled = false, truncated = false, size = 0
    const stdout = [], stderr = []
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), truncated, ...result })
    }
    const collect = buffer => data => {
      const bytes = Buffer.from(data)
      const remaining = Math.max(0, MAX_OUTPUT - size)
      buffer.push(bytes.subarray(0, remaining)); size += Math.min(remaining, bytes.length)
      if (bytes.length > remaining) truncated = true
    }
    try {
      child = spawnProcess('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', target, request.command], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr))
      child.on('error', error => finish({ state: 'failed', exitCode: null, error: error.message }))
      child.on('close', (code, signal) => finish({ state: code === 255 || signal ? 'unknown' : 'completed', exitCode: code, ...(code === 255 || signal ? { error: 'SSH disconnected; remote execution outcome is unknown. Do not automatically retry.' } : {}) }))
      timer = setTimeout(() => {
        // Disconnecting SSH is NOT proof that the remote process has stopped.
        finish({ state: 'unknown', exitCode: null, error: 'SSH timeout; remote command may still be running.' })
        child.kill()
      }, request.timeoutMs)
    } catch (error) { finish({ state: 'failed', exitCode: null, error: error.message }) }
  })
}
module.exports = { runSSH }
