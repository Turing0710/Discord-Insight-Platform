$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stableStartScript = Join-Path $PSScriptRoot "start-local-stable.ps1"
$logFile = Join-Path $PSScriptRoot "keep-site-alive.log"
$checkIntervalSeconds = 45

if (-not (Test-Path $stableStartScript)) {
  throw "Missing script: $stableStartScript"
}

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logFile -Value $line
}

function Is-Healthy {
  try {
    $frontend = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 6
    $backend = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 6
    return ($frontend.StatusCode -eq 200 -and $backend.StatusCode -eq 200)
  } catch {
    return $false
  }
}

Write-Log "watchdog started"

while ($true) {
  if (Is-Healthy) {
    Write-Log "healthy"
  } else {
    Write-Log "unhealthy -> restarting services"
    try {
      powershell -ExecutionPolicy Bypass -File $stableStartScript | Out-Null
      Start-Sleep -Seconds 4
      if (Is-Healthy) {
        Write-Log "restart succeeded"
      } else {
        Write-Log "restart finished but health still failed"
      }
    } catch {
      Write-Log ("restart error: " + $_.Exception.Message)
    }
  }
  Start-Sleep -Seconds $checkIntervalSeconds
}
