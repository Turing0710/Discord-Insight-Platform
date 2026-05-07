$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$backendVenvPython = Join-Path $backend ".venv\Scripts\python.exe"
$exporterDir = Join-Path $backend "tools\DiscordChatExporter.Cli"

function Test-DiscordExporterInstalled {
  $candidates = @(
    (Join-Path $exporterDir "DiscordChatExporter.Cli.exe"),
    (Join-Path $exporterDir "DiscordChatExporter.Cli.dll"),
    (Join-Path $exporterDir "DiscordChatExporter.Cli")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $true }
  }
  return $false
}

function Get-WindowsExporterAssetName {
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($arch -match "ARM64") { return "DiscordChatExporter.Cli.win-arm64.zip" }
  if ($arch -match "86") { return "DiscordChatExporter.Cli.win-x86.zip" }
  return "DiscordChatExporter.Cli.win-x64.zip"
}

function Install-DiscordExporter {
  if (Test-DiscordExporterInstalled) {
    Write-Output "[setup] DiscordChatExporter.Cli already exists."
    return
  }

  Write-Output "[setup] downloading DiscordChatExporter.Cli..."
  New-Item -ItemType Directory -Force -Path $exporterDir | Out-Null

  $assetName = Get-WindowsExporterAssetName
  $headers = @{ "User-Agent" = "discord-insight-platform-setup" }
  $release = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/Tyrrrz/DiscordChatExporter/releases/latest" `
    -Headers $headers `
    -TimeoutSec 60
  $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
  if (-not $asset) {
    throw "Could not find DiscordChatExporter release asset: $assetName"
  }

  $zipPath = Join-Path ([System.IO.Path]::GetTempPath()) $assetName
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers $headers -TimeoutSec 300
  Expand-Archive -Path $zipPath -DestinationPath $exporterDir -Force
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

  if (-not (Test-DiscordExporterInstalled)) {
    throw "DiscordChatExporter.Cli download finished, but executable was not found in: $exporterDir"
  }
  Write-Output "[setup] DiscordChatExporter.Cli installed to backend/tools/DiscordChatExporter.Cli"
}

Write-Output "[setup] Discord Insight Platform"
Write-Output "[setup] backend: $backend"
Write-Output "[setup] frontend: $frontend"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3.12+ is required. Install Python, then rerun this script."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js and npm are required. Install Node.js 20+, then rerun this script."
}

Install-DiscordExporter

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
Write-Output "2. Run: .\Start-Discord-Insight-Platform.bat"
