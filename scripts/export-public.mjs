// Reproducible clean-source export: no local Git history, deployment data or upstream automation.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root = process.cwd(), destination = path.resolve(process.argv[2] || '')
if (!process.argv[2] || destination === root || destination.startsWith(root + path.sep)) throw new Error('Choose a new export directory outside the source checkout')
if (fs.existsSync(destination)) throw new Error('Export destination already exists; refusing to overwrite')
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0').filter(Boolean))]
const privatePath = /(^|\/)(data|coach-auth|node_modules|outputs|work|\.codex|\.ssh|\.git)\/|(^|\/)\.env($|\.)|connection\.local\.json$|(^|\/)(db\.json|state-[^/]+\.json|owner-setup-code|bootstrap-admin-password|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx|bak|backup|log)$/i
let count = 0, bytes = 0
for (const file of files) {
  if (privatePath.test(file) && !['.env.example', '.env.local.example'].includes(file)) continue
  if (/^(\.gitea\/|\.gitlab\/|\.gitlab-ci\.yml$)/.test(file)) continue
  if (file.startsWith('.github/workflows/') && !['docker-publish.yml', 'public-check.yml'].includes(path.basename(file))) continue
  const source = path.join(root, file)
  if (!fs.existsSync(source)) continue
  if (!fs.lstatSync(source).isFile()) throw new Error('Export refuses symlink or special file: ' + file)
  const target = path.join(destination, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target); count++; bytes += fs.statSync(target).size
}
// Preserve Linux executable bits even when the export is made on Windows.
execFileSync('git', ['init', '-b', 'main'], { cwd: destination })
execFileSync('git', ['add', '--all'], { cwd: destination, maxBuffer: 32 * 1024 * 1024 })
const executable = execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  .split('\0').filter(row => row.startsWith('100755 ')).map(row => row.slice(row.indexOf('\t') + 1)).filter(file => fs.existsSync(path.join(destination, file)))
if (executable.length) execFileSync('git', ['update-index', '--chmod=+x', '--', ...executable], { cwd: destination })
execFileSync(process.execPath, ['scripts/audit-public-source.mjs'], { cwd: destination, stdio: 'inherit' })
console.log(JSON.stringify({ files: count, bytes, executableFiles: executable.length, historyIncluded: false, runtimeDataIncluded: false }))
