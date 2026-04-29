param(
  [switch]$ForceBuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$backend = Join-Path $root "backend"
$backendPy = Join-Path $backend ".venv\Scripts\python.exe"
$frontendStandaloneServer = Join-Path $frontend ".next\standalone\server.js"
$backendOut = Join-Path $PSScriptRoot "backend_local_out.log"
$backendErr = Join-Path $PSScriptRoot "backend_local_err.log"
$frontendOut = Join-Path $PSScriptRoot "frontend_local_out.log"
$frontendErr = Join-Path $PSScriptRoot "frontend_local_err.log"

if (-not (Test-Path $backendPy)) {
  throw "Backend venv python not found: $backendPy"
}

function Is-Healthy {
  try {
    $frontendResp = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 4
    $backendResp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 4
    return ($frontendResp.StatusCode -eq 200 -and $backendResp.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Stop-ProjectProcesses {
  param(
    [string]$ProcessName,
    [string]$CommandPattern
  )

  $targets = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq $ProcessName -and $_.CommandLine -and $_.CommandLine -match [regex]::Escape($CommandPattern)
  }

  foreach ($proc in $targets) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    } catch {}
  }
}

function Stop-PortListeners {
  param([int[]]$Ports)

  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
    $Ports -contains $_.LocalPort
  }

  foreach ($listener in $listeners) {
    try {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
    } catch {}
  }
}

function Reset-Logs {
  if (Test-Path $backendOut) { Remove-Item $backendOut -Force }
  if (Test-Path $backendErr) { Remove-Item $backendErr -Force }
  if (Test-Path $frontendOut) { Remove-Item $frontendOut -Force }
  if (Test-Path $frontendErr) { Remove-Item $frontendErr -Force }
}

function Build-Frontend {
  Write-Output "Building frontend..."
  if (Test-Path (Join-Path $frontend ".next")) {
    Remove-Item -LiteralPath (Join-Path $frontend ".next") -Recurse -Force
  }
  npm.cmd run build --prefix $frontend | Out-Null
}

function Prepare-StandaloneAssets {
  if (-not (Test-Path $frontendStandaloneServer)) {
    return
  }

  $standaloneRoot = Split-Path $frontendStandaloneServer -Parent
  $standaloneStatic = Join-Path $standaloneRoot ".next\static"
  $standalonePublic = Join-Path $standaloneRoot "public"
  $sourceStatic = Join-Path $frontend ".next\static"
  $sourcePublic = Join-Path $frontend "public"

  if (-not (Test-Path $sourceStatic)) {
    throw "Missing frontend static assets at: $sourceStatic"
  }
  if (-not (Test-Path $sourcePublic)) {
    throw "Missing frontend public assets at: $sourcePublic"
  }

  if (Test-Path $standaloneStatic) {
    Remove-Item -LiteralPath $standaloneStatic -Recurse -Force
  }
  if (Test-Path $standalonePublic) {
    Remove-Item -LiteralPath $standalonePublic -Recurse -Force
  }

  New-Item -ItemType Directory -Path (Split-Path $standaloneStatic -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $sourceStatic -Destination $standaloneStatic -Recurse -Force
  Copy-Item -LiteralPath $sourcePublic -Destination $standalonePublic -Recurse -Force
}

function Wait-Healthy {
  $frontendReady = $false
  $backendReady = $false

  for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $f = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 3
      if ($f.StatusCode -eq 200) { $frontendReady = $true }
    } catch {}
    try {
      $b = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 3
      if ($b.StatusCode -eq 200) { $backendReady = $true }
    } catch {}
    if ($frontendReady -and $backendReady) { break }
  }

  return @{
    FrontendReady = $frontendReady
    BackendReady = $backendReady
  }
}

function Stop-ExistingServices {
  # Stop old project processes to avoid duplicate servers and random conflicts.
  Stop-ProjectProcesses -ProcessName "node.exe" -CommandPattern $frontend
  Stop-ProjectProcesses -ProcessName "python.exe" -CommandPattern $backend
  Stop-ProjectProcesses -ProcessName "python.exe" -CommandPattern "uvicorn app.main:app"
  Stop-ProjectProcesses -ProcessName "node.exe" -CommandPattern "next start -H 0.0.0.0 -p 3000"
  Stop-ProjectProcesses -ProcessName "node.exe" -CommandPattern ".next\\standalone\\server.js"
  Start-Sleep -Milliseconds 500

  # Ensure ports are free before start.
  Stop-PortListeners -Ports @(3000, 8000)
  Start-Sleep -Milliseconds 500
}

function Start-Services {
  Stop-ExistingServices
  Reset-Logs

  $backendProc = Start-Process -FilePath $backendPy `
    -WorkingDirectory $backend `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000") `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr `
    -PassThru

  if (Test-Path $frontendStandaloneServer) {
    Prepare-StandaloneAssets
    $env:HOSTNAME = "0.0.0.0"
    $env:PORT = "3000"
    $frontendProc = Start-Process -FilePath "node.exe" `
      -WorkingDirectory $frontend `
      -ArgumentList @(".next\\standalone\\server.js") `
      -RedirectStandardOutput $frontendOut `
      -RedirectStandardError $frontendErr `
      -PassThru
  } else {
    $frontendProc = Start-Process -FilePath "npm.cmd" `
      -WorkingDirectory $frontend `
      -ArgumentList @("run", "start") `
      -RedirectStandardOutput $frontendOut `
      -RedirectStandardError $frontendErr `
      -PassThru
  }

  return @{
    FrontendProc = $frontendProc
    BackendProc = $backendProc
  }
}

if ((-not $ForceBuild) -and (Is-Healthy)) {
  Write-Output "ALREADY_HEALTHY"
  exit 0
}

$builtThisRun = $false
$needBuild = $ForceBuild -or (-not (Test-Path $frontendStandaloneServer))
if ($needBuild) {
  Stop-ExistingServices
  Build-Frontend
  $builtThisRun = $true
}

$procs = Start-Services
$state = Wait-Healthy

if ((-not $state.FrontendReady -or -not $state.BackendReady) -and (-not $builtThisRun)) {
  Write-Output "Quick start failed. Retry with clean rebuild..."
  Build-Frontend
  $procs = Start-Services
  $state = Wait-Healthy
}

if (-not ($state.FrontendReady -and $state.BackendReady)) {
  Write-Output "FAILED: frontendReady=$($state.FrontendReady) backendReady=$($state.BackendReady)"
  Write-Output "Check logs:"
  Write-Output "  $frontendOut"
  Write-Output "  $frontendErr"
  Write-Output "  $backendOut"
  Write-Output "  $backendErr"
  exit 1
}

Write-Output "OK"
Write-Output "Frontend PID=$($procs.FrontendProc.Id) URL=http://127.0.0.1:3000"
Write-Output "Backend  PID=$($procs.BackendProc.Id) URL=http://127.0.0.1:8000/health"
