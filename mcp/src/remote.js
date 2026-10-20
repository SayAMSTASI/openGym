import fs from 'node:fs'
export function connection(env = process.env) {
  let config = {}
  if (env.OPENGYM_CONNECTION_FILE) config = JSON.parse(fs.readFileSync(env.OPENGYM_CONNECTION_FILE, 'utf8'))
  const base = env.OPENGYM_URL || config.url
  if (!base) return null
  const url = new URL(base)
  if (url.username || url.password || url.search || url.hash) throw new Error('Use a clean openGym base URL without credentials, query or fragment')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS, or HTTP on localhost only')
  const token = env.OPENGYM_READ_TOKEN || config.token
  if (!/^gym_ro_[A-Za-z0-9_-]{43}$/.test(token || '')) throw new Error('A dedicated profile read token is required')
  return { url: url.href.replace(/\/$/, ''), token }
}
export async function readRemoteProfile(config, fetcher = fetch) {
  const response = await fetcher(config.url + '/api/integrations/profile', { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + config.token, Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'openGym read key expired or revoked; reconnect this profile' : `openGym profile request failed (${response.status})`)
  const reader = response.body.getReader(), chunks = []
  let bytes = 0
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 6 * 1024 * 1024) { await reader.cancel(); throw new Error('openGym profile response too large') } chunks.push(Buffer.from(value)) }
  } finally { reader.releaseLock() }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof result.user?.id !== 'string' || result.meta?.scope !== 'profile:read' || !result.meta?.readOnly) throw new Error('Invalid read-only profile response')
  if (result.state !== null && (!result.state || typeof result.state !== 'object' || Array.isArray(result.state))) throw new Error('Invalid profile state')
  return result
}
