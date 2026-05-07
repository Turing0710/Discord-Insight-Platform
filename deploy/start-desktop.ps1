$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stableStart = Join-Path $PSScriptRoot "start-local-stable.ps1"
$logPath = Join-Path $PSScriptRoot "desktop-start.log"
$cloudflaredOut = Join-Path $PSScriptRoot "cloudflared_tunnel_out.log"
$cloudflaredErr = Join-Path $PSScriptRoot "cloudflared_tunnel_err.log"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$localUrl = "http://127.0.0.1:3000"
$shortlink = ""

function Write-Step {
  param([string]$Message)
  $line = "[desktop] $Message"
  Write-Output $line
  Add-Content -Path $logPath -Value $line
}

function Open-Url {
  param([string]$Url)
  try {
    Start-Process $Url | Out-Null
  } catch {
    Write-Step "Could not open browser automatically: $($_.Exception.Message)"
  }
}

Set-Content -Path $logPath -Value "[desktop] start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

if (-not (Test-Path $stableStart)) {
  throw "Missing script: $stableStart"
}

Write-Step "Starting local services..."
$localOutput = powershell -NoProfile -ExecutionPolicy Bypass -File $stableStart 2>&1
$localOutput | ForEach-Object {
  $text = [string]$_
  Write-Output $text
  Add-Content -Path $logPath -Value $text
}

Write-Step "Opening local site: $localUrl"
Open-Url $localUrl

if (Test-Path $cloudflared) {
  Write-Step "Creating external quick tunnel..."
  try {
    $existingTunnels = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    foreach ($proc in $existingTunnels) {
      try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop } catch {}
    }
    Start-Sleep -Milliseconds 400

    if (Test-Path $cloudflaredOut) { try { Remove-Item $cloudflaredOut -Force } catch {} }
    if (Test-Path $cloudflaredErr) { try { Remove-Item $cloudflaredErr -Force } catch {} }

    Start-Process -FilePath $cloudflared `
      -ArgumentList @("tunnel", "--protocol", "http2", "--url", $localUrl, "--no-autoupdate") `
      -RedirectStandardOutput $cloudflaredOut `
      -RedirectStandardError $cloudflaredErr `
      -WindowStyle Hidden `
      -PassThru | Out-Null

    for ($i = 0; $i -lt 80; $i++) {
      Start-Sleep -Milliseconds 500
      $text = ""
      if (Test-Path $cloudflaredOut) { $text += Get-Content $cloudflaredOut -Raw -ErrorAction SilentlyContinue }
      if (Test-Path $cloudflaredErr) { $text += "`n" + (Get-Content $cloudflaredErr -Raw -ErrorAction SilentlyContinue) }
      $match = [regex]::Match($text, "https://[-a-z0-9]+\.trycloudflare\.com")
      if ($match.Success) {
        $shortlink = $match.Value
        break
      }
    }

    if ($shortlink) {
      Write-Step "Opening external site: $shortlink"
      Open-Url $shortlink
    } else {
      Write-Step "External tunnel started, but no URL was detected. Check deploy/cloudflared_tunnel_err.log."
    }
  } catch {
    Write-Step "External quick tunnel failed: $($_.Exception.Message)"
    Write-Step "Local site is still available at $localUrl"
  }
} else {
  Write-Step "cloudflared not found. Local site is still available."
}

Write-Step "Ready."
Write-Output ""
Write-Output "Local site:    $localUrl"
if ($shortlink) {
  Write-Output "External site: $shortlink"
}
Write-Output ""
Write-Output "You can keep this window open for the link, or close it after the browser opens."
