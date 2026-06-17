# Запуск OmniRoute + Kiro через прокси Amsterdam (после перезагрузки ПК).
# Запуск: powershell -ExecutionPolicy Bypass -File .\start-omniroute.ps1

$ErrorActionPreference = "Stop"

$nodePath = "C:\Users\mashi\.local\node-v24.16.0-win-x64"
$globalPath = "C:\Users\mashi\.local\node-global"
$port = 20128
$proxy = "http://103.112.69.87:3128"

$env:Path = "$nodePath;$globalPath;" + $env:Path
$env:ALL_PROXY = $proxy
$env:HTTP_PROXY = $proxy
$env:HTTPS_PROXY = $proxy
$env:NO_PROXY = "127.0.0.1,localhost"

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "OmniRoute already listening on port $port (PID $($existing[0].OwningProcess))"
    Write-Host "Dashboard: http://127.0.0.1:$port"
    exit 0
}

Write-Host "Starting OmniRoute on port $port via proxy $proxy ..."
Write-Host "Keep this window open."
Write-Host ""

omniroute --port $port --no-open
