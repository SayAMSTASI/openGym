// No credential values are printed, including on failure. Run against a staged public tree.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root = process.cwd()
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0').filter(Boolean)
const forbidden = /(^|\/)(data|coach-auth|node_modules|outputs|work|\.codex|\.ssh)\/|(^|\/)\.env($|\.)|connection\.local\.json$|(^|\/)(db\.json|state-[^/]+\.json|owner-setup-code|bootstrap-admin-password|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx|bak|backup|log)$/i
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bgym_ro_[A-Za-z0-9_-]{43}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
  /\bsk-(?:proj-|ant-)[A-Za-z0-9_-]{40,}\b/
]
let failed = 0
for (const file of files) {
  if (forbidden.test(file) && !['.env.example', '.env.local.example'].includes(file)) { console.error('Forbidden runtime/secret path:', file); failed++; continue }
  const content = fs.readFileSync(path.join(root, file)).toString('utf8')
  if (patterns.some(re => re.test(content))) { console.error('Possible credential in:', file); failed++ }
}
if (!files.length) throw new Error('No tracked files to audit')
if (failed) { console.error(`Public-source audit refused ${failed} file(s)`); process.exit(1) }
console.log(`Public-source audit passed: ${files.length} tracked files; no forbidden runtime paths or recognized secret formats`)
