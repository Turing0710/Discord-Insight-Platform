$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stableStart = Join-Path $PSScriptRoot "start-local-stable.ps1"
$watchdog = Join-Path $PSScriptRoot "keep-site-alive.ps1"
$siteUrl = "http://127.0.0.1:3000"

if (-not (Test-Path $stableStart)) {
  throw "Missing script: $stableStart"
}
if (-not (Test-Path $watchdog)) {
  throw "Missing script: $watchdog"
}

# Start/repair services once.
Write-Output "Starting/repairing local services..."
powershell -NoProfile -ExecutionPolicy Bypass -File $stableStart

# Ensure only one watchdog process is running for this repo.
$existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq "powershell.exe" -and $_.CommandLine -and $_.CommandLine -match [regex]::Escape($watchdog)
}
foreach ($proc in $existing) {
  try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {}
}

Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $watchdog) -WindowStyle Hidden | Out-Null

Start-Process $siteUrl | Out-Null
Write-Output "SITE=$siteUrl"
