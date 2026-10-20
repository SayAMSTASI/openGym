// Actual MCP stdio handshake and tool call; never prints credentials or full health records.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/index.js')],
  env: { ...process.env, OPENGYM_CONNECTION_FILE: process.env.OPENGYM_CONNECTION_FILE || path.join(root, 'connection.local.json') }, stderr: 'pipe' })
const client = new Client({ name: 'opengym-connection-check', version: '1.0.0' })
try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  if (tools.length !== 13 || tools.some(t => !t.annotations?.readOnlyHint || t.annotations?.destructiveHint)) throw new Error('Read-only tool list verification failed')
  const from = process.argv[2], to = process.argv[3]
  if (!from || !to) throw new Error('Pass from and to dates (YYYY-MM-DD)')
  const result = await client.callTool({ name: 'get_profile_summary', arguments: { from, to } })
  if (result.isError) throw new Error(result.content?.[0]?.text || 'MCP tool failed')
  const summary = JSON.parse(result.content.find(c => c.type === 'text').text)
  const catalogResult = await client.callTool({ name: 'get_food_catalog', arguments: { limit: 1 } })
  if (catalogResult.isError) throw new Error('Food catalog tool failed')
  const catalog = JSON.parse(catalogResult.content.find(c => c.type === 'text').text)
  console.log(JSON.stringify({ connected: true, profile: summary.profile.name, tools: tools.map(t => t.name), readOnly: true, period: summary.period,
    workouts: summary.workouts.length, weighins: summary.weighins.length, foodLoggedDays: summary.nutrition.logged_days,
    supplementSchedules: summary.supplement_tracking.schedules.length, savedFoodsAndRecipes: catalog.total, source: summary.source }, null, 2))
} finally { await client.close() }
