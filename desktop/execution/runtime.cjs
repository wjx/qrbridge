const { ExecutionBridge } = require('./bridge.cjs')
// Bundled SDK lives beside this directory in the packaged application.
const { startMCP } = require('../mcp-bundle.cjs')
function createRuntime(directory, clipboard) {
  const bridge = new ExecutionBridge(directory)
  let mcp = null, changing = false
  const timer = setInterval(() => bridge.tick(clipboard), 250)
  timer.unref()
  return {
    bridge,
    async action(action, value) {
      if (changing) throw new Error('Mode change in progress')
      if (action === 'snapshot') return bridge.snapshot()
      if (action === 'configure') return bridge.configure(value)
      if (action === 'scan') { bridge.receiveQR(value); return null }
      if (action === 'submit') return bridge.submit(value)
      if (action === 'start' || action === 'stop') {
        changing = true
        try {
          if (action === 'start' && !bridge.active) {
            bridge.start()
            try { if (bridge.config.role === 'receiver') mcp = await startMCP(bridge) }
            catch (error) { bridge.active = false; throw error }
          } else if (action === 'stop') {
            bridge.stop()
            if (mcp) { await mcp.close(); mcp = null }
          }
          return bridge.snapshot()
        } finally { changing = false }
      }
      throw new Error('Unknown execution action')
    },
    dispose() { clearInterval(timer); bridge.active = false; if (mcp) void mcp.close() },
  }
}
module.exports = { createRuntime }
