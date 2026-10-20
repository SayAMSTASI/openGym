param(
    [ValidateSet('start', 'stop', 'status', 'check')]
    [string]$Action = 'start',
    [switch]$Build
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is required.'
    }
    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.local.example' -Destination '.env'
    }
    $composeArgs = @('compose', '-f', 'docker-compose.yml', '-f', 'compose.local.yml')
    function Invoke-Compose {
        param([string[]]$DockerArgs)
        & docker @composeArgs @DockerArgs
        if ($LASTEXITCODE -ne 0) { throw "Docker failed (exit $LASTEXITCODE)." }
    }
    $portLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^WEB_PORT=\d+$' } | Select-Object -Last 1
    $webPort = if ($portLine) { ($portLine -split '=', 2)[1] } else { '18081' }
    $url = "http://localhost:$webPort"
    switch ($Action) {
        'stop' { Invoke-Compose -DockerArgs @('stop'); return }
        'status' { Invoke-Compose -DockerArgs @('ps'); return }
        'start' {
            $up = @('up', '-d', '--wait', '--wait-timeout', '180')
            # Compose builds a missing local image automatically. -Build rebuilds source changes.
            if ($Build) { $up += '--build' }
            Invoke-Compose -DockerArgs $up
        }
    }
    $config = Invoke-RestMethod -Uri "$url/api/config" -TimeoutSec 15
    $health = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 15
    $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    if ($config.default_lang -ne 'ru') { throw 'DEFAULT_LANG is not ru.' }
    if ($health.StatusCode -ne 200 -or $page.StatusCode -ne 200) { throw 'Health check failed.' }
    Write-Host "openGym OK: $url (default language: ru)"
    Write-Host "Persistent data: $(Join-Path $projectRoot 'data')"
}
finally { Pop-Location }
