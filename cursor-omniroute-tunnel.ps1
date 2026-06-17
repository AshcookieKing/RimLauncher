# Запуск: proxy + SSH-туннель для Cursor BYOK.
# Окно держать открытым.

$ErrorActionPreference = "Stop"

$omniPort = 20128
$proxyPort = 20127
$remoteHost = "103.112.69.87"
$remoteUser = "root"
$remotePort = 20129
$keyPath = "$env:USERPROFILE\.ssh\id_rsa"
$proxyScript = Join-Path $PSScriptRoot "cursor-model-proxy.py"
$apiKey = "sk-c3819e697a06dda5-8f457d-5be312a0"

function Test-Port($port) {
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$port/v1/models" `
            -Headers @{ Authorization = "Bearer $apiKey" } `
            -TimeoutSec 8 -UseBasicParsing
        return $true
    } catch { return $false }
}

if (-not (Test-Port $omniPort)) {
    Write-Host "ERROR: OmniRoute not running on 127.0.0.1:$omniPort"
    Write-Host "Start: omniroute --port 20128 --no-open"
    exit 1
}
Write-Host "OK: OmniRoute on $omniPort"

$proxyProc = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*cursor-model-proxy.py*" } |
    Select-Object -First 1

if (-not $proxyProc) {
    Write-Host "Starting model proxy on 127.0.0.1:$proxyPort ..."
    Start-Process python -ArgumentList $proxyScript -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

if (-not (Test-Port $proxyPort)) {
    Write-Host "ERROR: model proxy failed on 127.0.0.1:$proxyPort"
    exit 1
}
Write-Host "OK: model proxy on $proxyPort"

Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "Cursor Settings -> Models:"
Write-Host "  Base URL: http://${remoteHost}:${remotePort}/v1"
Write-Host "  Custom model: omni-sonnet   (NOT kr/claude-sonnet-4.5)"
Write-Host "  MAX Mode: OFF | Mode: Ask"
Write-Host ""
Write-Host "Tunnel running. Keep this window open."
Write-Host ""

ssh -N `
    -i $keyPath `
    -o ServerAliveInterval=30 `
    -o ExitOnForwardFailure=yes `
    -o StrictHostKeyChecking=accept-new `
    -R "0.0.0.0:${remotePort}:127.0.0.1:${proxyPort}" `
    "${remoteUser}@${remoteHost}"
