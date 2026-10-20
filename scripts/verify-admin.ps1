param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not $SkipBuild) {
        & docker compose -f docker-compose.yml -f compose.local.yml build api
        if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
    }
    $mount = "type=bind,source=$projectRoot,target=/workspace,readonly"
    $checks = 'ln -s /app/node_modules /node_modules && node --test --test-reporter=spec test/bootstrap-admin.test.js test/bootstrap-admin-server.test.js test/server-password.test.js test/server-first-user-admin.test.js test/server-admin-state.test.js test/server-admin-delete.test.js test/dockerfile-copy.test.js'
    & docker run --rm --mount $mount --workdir /workspace/api opengym-local-api:ru sh -c $checks
    if ($LASTEXITCODE -ne 0) { throw 'Administrator checks failed.' }
}
finally { Pop-Location }
