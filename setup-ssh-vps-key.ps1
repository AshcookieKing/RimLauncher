# Один раз: добавить ваш SSH-ключ на VPS, чтобы туннель не спрашивал пароль.
# Запуск: powershell -ExecutionPolicy Bypass -File .\setup-ssh-vps-key.ps1

$ErrorActionPreference = "Stop"

$remoteHost = "103.112.69.87"
$remoteUser = "root"
$keyPath = "$env:USERPROFILE\.ssh\id_rsa"
$pubPath = "$keyPath.pub"

if (-not (Test-Path $pubPath)) {
    Write-Host "SSH key not found. Creating..."
    ssh-keygen -t rsa -b 4096 -f $keyPath -N '""' -q
}

Write-Host ""
Write-Host "=== Сейчас SSH спросит пароль root ОДИН РАЗ ==="
Write-Host "Пароль НЕ отображается при вводе — это нормально."
Write-Host "Наберите пароль вслепую и нажмите Enter."
Write-Host ""

$pub = Get-Content $pubPath -Raw
$cmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$($pub.Trim())' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY_INSTALLED_OK"

ssh -o StrictHostKeyChecking=accept-new "${remoteUser}@${remoteHost}" $cmd

Write-Host ""
Write-Host "Testing key login (password should NOT be asked)..."
ssh -o BatchMode=yes -o ConnectTimeout=10 "${remoteUser}@${remoteHost}" "echo SSH_KEY_OK"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done. Now run: .\cursor-omniroute-tunnel.ps1"
} else {
    Write-Host ""
    Write-Host "Key login failed. Check root password and try again."
    exit 1
}
