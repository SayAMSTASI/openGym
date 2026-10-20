#!/usr/bin/env node
/* openGym MCP server — stdio transport. The LLM client (Codex, Claude Desktop, …) spawns
   this process locally, talks JSON-RPC over stdin/stdout, tears it down when the session ends.
   Reads the configured profile API, or trusted local files. No extra container. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { TOOLS } from './tools.js'
import { init, getUser, withRemoteState } from './state.js'
import { connection, readRemoteProfile } from './remote.js'
import { WELLNESS_TOOLS } from './wellness-tools.js'
const remote = connection()

const server = new McpServer({
  name: 'opengym',
  version: '0.1.0'
})

// Fail fast on bad config so a misnamed OPENGYM_DATA doesn't silently answer every call with
// the no-state sentinel. Always register every tool so the LLM sees the full list at
// handshake, even when state didn't resolve.
try {
  if (!remote) init()
  const u = remote ? (await readRemoteProfile(remote)).user : getUser()
  console.error(`[opengym-mcp] serving profile ${u.name} (${u.id})`)
} catch (e) {
  console.error(`[opengym-mcp] ${e.message}`)
  // Don't exit — keep the tool listings up so the user sees a useful error after fixing their
  // env and restarting.
}

for (const t of [...TOOLS, ...WELLNESS_TOOLS]) {
  server.tool(
    t.name,
    t.description,
    t.schema,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (params) => {
      try {
        const result = remote
          ? await withRemoteState(await readRemoteProfile(remote), () => t.handler(params || {}))
          : t.handler(params || {})
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        const code = err.code || 'ERROR'
        return {
          isError: true,
          content: [{ type: 'text', text: `${code}: ${err.message}` }]
        }
      }
    }
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)
// Process stays alive serving JSON-RPC over stdio until the LLM client disconnects.
