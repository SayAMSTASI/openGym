param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
function Invoke-Docker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Check failed (Docker exit $LASTEXITCODE)." }
}
Push-Location $projectRoot
try {
    if (-not $SkipBuild) {
        Invoke-Docker -DockerArgs @('build', '--target', 'build', '--tag', 'opengym-local-frontend-check', '-f', 'web/Dockerfile', '.')
        Invoke-Docker -DockerArgs @('compose', '-f', 'docker-compose.yml', '-f', 'compose.local.yml', 'build', 'api')
    }
    $mount = "type=bind,source=$projectRoot,target=/workspace,readonly"
    # Every test owns a temporary data directory; the real profile data is never mounted at /data.
    $apiChecks = 'ln -s /app/node_modules /node_modules && node --test --test-reporter=spec test/supplements.test.js test/supplements-sync.test.js test/supplements-server.test.js test/server-reminder.test.js test/server-config-session.test.js test/dockerfile-copy.test.js'
    Invoke-Docker -DockerArgs @('run', '--rm', '--mount', $mount, '--workdir', '/workspace/api', 'opengym-local-api:ru', 'sh', '-c', $apiChecks)
    $webChecks = 'ln -s /app/frontend/node_modules /node_modules && node scripts/check-locales.mjs && node scripts/check-source-strings.mjs --strict && /app/frontend/node_modules/.bin/vitest run src/views/Supplements.test.jsx src/components/SupplementReminders.test.jsx src/lib/push.test.js src/lib/sync-merge.test.js src/lib/sync-stamps-parity.test.js src/lib/sw.test.js src/lib/sw-subpath.test.js src/lib/sw-offline-launch.test.js src/lib/sw-media.test.js src/lib/sw-lazy.test.js'
    Invoke-Docker -DockerArgs @('run', '--rm', '--mount', $mount, '--workdir', '/workspace/frontend', 'opengym-local-frontend-check', 'sh', '-c', $webChecks)
    Write-Host 'Supplement, sync, notification and offline checks passed.'
}
finally { Pop-Location }
