param(
  [switch]$StopExisting
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$backendPython = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $backendPython)) {
  throw "Missing backend virtual environment. Run scripts/setup.ps1 first."
}

function Get-PortListeners {
  param([int[]]$Ports)
  return Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $Ports -contains $_.LocalPort }
}

$listeners = @(Get-PortListeners -Ports @(3000, 8000))
if ($listeners.Count -gt 0) {
  if (-not $StopExisting) {
    $ports = ($listeners | Select-Object -ExpandProperty LocalPort -Unique) -join ", "
    throw "Port(s) already in use: $ports. Close those services or rerun with -StopExisting."
  }
  foreach ($listener in $listeners) {
    try { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop } catch {}
  }
  Start-Sleep -Seconds 1
}

$backendCommand = "Set-Location -LiteralPath '$backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
$frontendCommand = "Set-Location -LiteralPath '$frontend'; npm run dev"

Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand) -WorkingDirectory $backend
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand) -WorkingDirectory $frontend

Write-Output "[start] backend:  http://127.0.0.1:8000/health"
Write-Output "[start] frontend: http://127.0.0.1:3000"
Write-Output "[start] two PowerShell windows were opened for live logs."
