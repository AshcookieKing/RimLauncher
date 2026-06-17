# Cloudflare quick tunnel к локальному OmniRoute (если SSH на VPS недоступен).
# Запуск: powershell -ExecutionPolicy Bypass -File .\cursor-cloudflared-tunnel.ps1
# Скопируйте URL из вывода и добавьте /v1 в Cursor Settings → Models.

$ErrorActionPreference = "Stop"

$cloudflared = "C:\Users\mashi\.local\cloudflared\cloudflared.exe"
$localUrl = "http://127.0.0.1:20128"

if (-not (Test-Path $cloudflared)) {
    Write-Host "cloudflared not found at $cloudflared"
    Write-Host "Run cursor setup once to download it, or install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
}

Write-Host "Checking OmniRoute at $localUrl ..."
try {
    $null = Invoke-WebRequest -Uri "$localUrl/v1/models" `
        -Headers @{ Authorization = "Bearer sk-c3819e697a06dda5-8f457d-5be312a0" } `
        -TimeoutSec 8 -UseBasicParsing
    Write-Host "OK: OmniRoute is running."
} catch {
    Write-Host "ERROR: Start OmniRoute first: omniroute --port 20128 --no-open"
    exit 1
}

Write-Host ""
Write-Host "Starting Cloudflare tunnel (HTTP/2). Keep this window open."
Write-Host "In Cursor use: https://YOUR-URL.trycloudflare.com/v1"
Write-Host ""

& $cloudflared tunnel --url $localUrl --protocol http2 --no-autoupdate
