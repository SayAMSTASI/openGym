param([string]$ConnectionFile)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $ConnectionFile) { $ConnectionFile = Join-Path $projectRoot 'mcp\connection.local.json' }
$ConnectionFile = (Resolve-Path -LiteralPath $ConnectionFile).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$entry = Join-Path $projectRoot 'mcp\src\index.js'
# Codex stores only the path; the profile token is never passed as a CLI argument.
& codex mcp add opengym --env "OPENGYM_CONNECTION_FILE=$ConnectionFile" --env 'TZ=Europe/Moscow' -- $nodePath $entry
if ($LASTEXITCODE -ne 0) { throw 'Could not register openGym MCP in Codex.' }
Write-Host 'openGym MCP registered. Restart the MCP connection in Codex if tools are not yet visible.'
