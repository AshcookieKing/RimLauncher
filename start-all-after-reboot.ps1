# Запуск всего после перезагрузки Windows (1 окно — держать открытым).
#   powershell -ExecutionPolicy Bypass -File .\start-all-after-reboot.ps1
#
# Что поднимает:
#   1) OmniRoute :20128 (через прокси Amsterdam)
#   2) Model proxy :20127 (omni-sonnet для Cursor)
#   3) SSH-туннель :20129 на VPS
#
# Cursor BYOK Base URL: http://103.112.69.87:20129/v1
# Claude Code / CLI:    http://127.0.0.1:20128

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = "C:\Users\mashi\.local\node-v24.16.0-win-x64"
$globalPath = "C:\Users\mashi\.local\node-global"
$proxy = "http://103.112.69.87:3128"
$apiKey = "sk-c3819e697a06dda5-8f457d-5be312a0"
$keyPath = "$env:USERPROFILE\.ssh\id_rsa"

$env:Path = "$nodePath;$globalPath;" + $env:Path
$env:ALL_PROXY = $proxy
$env:HTTP_PROXY = $proxy
$env:HTTPS_PROXY = $proxy
$env:NO_PROXY = "127.0.0.1,localhost"

function Stop-Port($port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            if ($_ -and $_ -ne 0) {
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            }
        }
}

function Test-Omni($port) {
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$port/v1/models" `
            -Headers @{ Authorization = "Bearer $apiKey" } -TimeoutSec 8 -UseBasicParsing
        return $true
    } catch { return $false }
}

Write-Host "=== Stop old OmniRoute / proxy / tunnel ==="
Stop-Port 20127
Stop-Port 20128
Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "=== Start OmniRoute :20128 ==="
if (-not (Test-Omni 20128)) {
    Start-Process -FilePath "omniroute" -ArgumentList "--port","20128","--no-open" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}
if (-not (Test-Omni 20128)) {
    Write-Host "ERROR: OmniRoute not started. Run: omniroute --port 20128 --no-open"
    exit 1
}
Write-Host "OK: OmniRoute"

Write-Host "=== Start model proxy :20127 ==="
Start-Process python -ArgumentList (Join-Path $root "cursor-model-proxy.py") -WindowStyle Hidden
Start-Sleep -Seconds 2
if (-not (Test-Omni 20127)) {
    Write-Host "ERROR: model proxy failed"
    exit 1
}
Write-Host "OK: model proxy"

Write-Host "=== Clear stale VPS tunnel :20129 ==="
ssh -i $keyPath -o ConnectTimeout=10 root@103.112.69.87 `
    "fuser -k 20129/tcp 2>/dev/null || true; sleep 1; ss -tlnp | grep 20129 || echo port-free"
Start-Sleep -Seconds 1

Write-Host "=== Start SSH tunnel :20129 ==="
Write-Host ""
Write-Host "Cursor Settings -> Models:"
Write-Host "  Base URL: http://103.112.69.87:20129/v1"
Write-Host "  Model:    omni-sonnet"
Write-Host "  MAX Mode: OFF | Mode: Ask"
Write-Host ""
Write-Host "Keep this window OPEN."
Write-Host ""

ssh -N `
    -i $keyPath `
    -o ServerAliveInterval=30 `
    -o ExitOnForwardFailure=yes `
    -o StrictHostKeyChecking=accept-new `
    -R "0.0.0.0:20129:127.0.0.1:20127" `
    root@103.112.69.87
