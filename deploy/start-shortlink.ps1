$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stableStart = Join-Path $PSScriptRoot "start-local-stable.ps1"
$logOut = Join-Path $PSScriptRoot "cloudflared_tunnel_out.log"
$logErr = Join-Path $PSScriptRoot "cloudflared_tunnel_err.log"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (-not (Test-Path $cloudflared)) {
  throw "cloudflared not found at: $cloudflared"
}
if (-not (Test-Path $stableStart)) {
  throw "Missing script: $stableStart"
}

# Stop existing quick tunnel processes first.
$existing = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($existing) {
  foreach ($proc in $existing) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop } catch {}
  }
  Start-Sleep -Milliseconds 400
}

if (Test-Path $logOut) { try { Remove-Item $logOut -Force } catch {} }
if (Test-Path $logErr) { try { Remove-Item $logErr -Force } catch {} }

# Ensure local services are up (frontend:3000, backend:8000).
powershell -NoProfile -ExecutionPolicy Bypass -File $stableStart | Out-Null

Start-Process -FilePath $cloudflared `
  -ArgumentList @("tunnel", "--protocol", "http2", "--url", "http://127.0.0.1:3000", "--no-autoupdate") `
  -RedirectStandardOutput $logOut `
  -RedirectStandardError $logErr `
  -PassThru | Out-Null

$url = ""
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  $text = ""
  if (Test-Path $logOut) { $text += Get-Content $logOut -Raw }
  if (Test-Path $logErr) { $text += "`n" + (Get-Content $logErr -Raw) }
  $match = [regex]::Match($text, "https://[-a-z0-9]+\.trycloudflare\.com")
  if ($match.Success) {
    $url = $match.Value
    break
  }
}

if (-not $url) {
  throw "Failed to get shortlink. Check logs: $logOut and $logErr"
}

Write-Output "SHORTLINK=$url"
