$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$backendVenvPython = Join-Path $backend ".venv\Scripts\python.exe"

Write-Output "[setup] Discord Insight Platform"
Write-Output "[setup] backend: $backend"
Write-Output "[setup] frontend: $frontend"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3.12+ is required. Install Python, then rerun this script."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js and npm are required. Install Node.js 20+, then rerun this script."
}

if (-not (Test-Path $backendVenvPython)) {
  Write-Output "[setup] creating backend virtual environment..."
  python -m venv (Join-Path $backend ".venv")
}

Write-Output "[setup] installing backend dependencies..."
& $backendVenvPython -m pip install --upgrade pip
& $backendVenvPython -m pip install -r (Join-Path $backend "requirements.txt")

Write-Output "[setup] installing frontend dependencies..."
npm install --prefix $frontend

$backendEnv = Join-Path $backend ".env"
$backendEnvExample = Join-Path $backend ".env.example"
if (-not (Test-Path $backendEnv) -and (Test-Path $backendEnvExample)) {
  Copy-Item $backendEnvExample $backendEnv
  Write-Output "[setup] created backend/.env from backend/.env.example"
}

$frontendEnv = Join-Path $frontend ".env.local"
$frontendEnvExample = Join-Path $frontend ".env.local.example"
if (-not (Test-Path $frontendEnv) -and (Test-Path $frontendEnvExample)) {
  Copy-Item $frontendEnvExample $frontendEnv
  Write-Output "[setup] created frontend/.env.local from frontend/.env.local.example"
}

Write-Output ""
Write-Output "[setup] done. Before starting:"
Write-Output "1. Edit backend/.env if you want to provide default DISCORD_TOKEN or change settings."
Write-Output "2. Put DiscordChatExporter.Cli files into backend/tools/DiscordChatExporter.Cli for local non-Docker use."
Write-Output "3. Run: powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1"
