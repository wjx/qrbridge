const http = require('node:http')
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const tools = [
  { name: 'ssh_targets', description: 'List SSH destinations received from the sender handshake. Start screen scanning first.', inputSchema: object({}) },
  { name: 'ssh_submit', description: 'Queue one non-interactive SSH command. Returns a job ID immediately; poll ssh_status for QR-delivered results. Reuse requestId when retrying a submission. Never automatically resubmit an unknown outcome under a new ID.', inputSchema: object({ target: { type: 'string' }, command: { type: 'string', maxLength: 8000 }, timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, default: 30000 }, requestId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,80}$' } }, ['target', 'command']) },
  { name: 'ssh_status', description: 'Read locally cached task status, stdout, stderr, exitCode and truncation flag. Keep scanning sender QR codes to receive updates. unknown means the command may still be running.', inputSchema: object({ jobId: { type: 'string' } }, ['jobId']) },
]
async function startMCP(bridge, port = bridge.config.port) {
  const connections = new Set()
  const httpServer = http.createServer(async (req, res) => {
    // No browser origins are needed: Electron uses IPC, MCP clients use HTTP.
    if (req.headers.origin || !/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) { res.writeHead(403).end(); return }
    if (req.headers.authorization !== `Bearer ${bridge.config.token}`) { res.writeHead(401).end(); return }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return }
    if (!bridge.active || bridge.config.role !== 'receiver') { res.writeHead(503).end(); return }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return }
    let size = 0
    try {
      const parts = []
      for await (const part of req) {
        size += part.length
        if (size > 32768) { res.writeHead(413).end(); return }
        parts.push(part)
      }
      let body
      try { body = JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { res.writeHead(400).end(); return }
      const server = new Server({ name: 'qrbridge-ssh', version: '0.1.0' }, { capabilities: { tools: {} } })
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
      server.setRequestHandler(CallToolRequestSchema, async request => {
        try {
          if (!bridge.active) throw new Error('Execution mode is disabled')
          const args = request.params.arguments ?? {}
          let value
          switch (request.params.name) {
            case 'ssh_targets': value = { targets: bridge.targets, ready: bridge.targets.length > 0 }; break
            case 'ssh_submit': value = bridge.submit(args); break
            case 'ssh_status': value = bridge.status(args.jobId); break
            default: throw new Error('Unknown tool')
          }
          return { content: [{ type: 'text', text: JSON.stringify(value) }] }
        } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] } }
      })
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      connections.add(server)
      res.on('close', () => { connections.delete(server); void server.close() })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  httpServer.requestTimeout = 10000
  httpServer.headersTimeout = 10000
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, '127.0.0.1', resolve)
  })
  return {
    port: httpServer.address().port,
    close: async () => {
      for (const connection of connections) await connection.close()
      await new Promise(resolve => { httpServer.close(resolve); httpServer.closeAllConnections() })
    },
  }
}
module.exports = { startMCP }
