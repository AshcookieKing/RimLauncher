param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$ReleaseDir
)

$ErrorActionPreference = 'Stop'
$owner = 'AshcookieKing'
$repo = 'RimLauncher'
$tag = "v$Version"

$credRaw = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
$token = ($credRaw | Select-String '^password=(.+)$').Matches.Groups[1].Value
if (-not $token) { throw 'GitHub token not found in git credentials' }

$headers = @{
  Authorization = "Bearer $token"
  Accept        = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

$body = @{
  tag_name         = $tag
  name             = "StarFront Launcher $Version"
  body             = "StarFront logo holo, SF4 preset, TS password StarFront, units CG/104/RS. Version $Version"
  draft            = $false
  prerelease       = $false
  make_latest      = 'true'
  generate_release_notes = $false
} | ConvertTo-Json

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases" -Method Post -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8'
$uploadBase = $release.upload_url -replace '\{.*$', ''

$assets = @(
  'RimConflictLauncher.exe',
  "RimConflictLauncher-$Version.zip",
  'latest.yml'
)

foreach ($name in $assets) {
  $path = Join-Path $ReleaseDir $name
  if (-not (Test-Path $path)) { throw "Missing asset: $path" }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $uploadHeaders = @{
    Authorization = $headers.Authorization
    Accept        = 'application/vnd.github+json'
    'Content-Type' = 'application/octet-stream'
  }
  $uri = "${uploadBase}?name=$([uri]::EscapeDataString($name))"
  Invoke-RestMethod -Uri $uri -Method Post -Headers $uploadHeaders -Body $bytes | Out-Null
  Write-Output "Uploaded $name"
}

Write-Output "Release: $($release.html_url)"
