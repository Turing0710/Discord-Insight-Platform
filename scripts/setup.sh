#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT_DIR/backend"
FRONTEND="$ROOT_DIR/frontend"
EXPORTER_DIR="$BACKEND/tools/DiscordChatExporter.Cli"

exporter_installed() {
  [[ -x "$EXPORTER_DIR/DiscordChatExporter.Cli" || -f "$EXPORTER_DIR/DiscordChatExporter.Cli.dll" || -f "$EXPORTER_DIR/DiscordChatExporter.Cli.exe" ]]
}

detect_exporter_asset() {
  local os_name arch
  os_name="$(uname -s)"
  arch="$(uname -m)"

  case "$os_name" in
    Darwin)
      if [[ "$arch" == "arm64" ]]; then
        echo "DiscordChatExporter.Cli.osx-arm64.zip"
      else
        echo "DiscordChatExporter.Cli.osx-x64.zip"
      fi
      ;;
    Linux)
      if [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
        echo "DiscordChatExporter.Cli.linux-arm64.zip"
      elif [[ "$arch" == arm* ]]; then
        echo "DiscordChatExporter.Cli.linux-arm.zip"
      else
        echo "DiscordChatExporter.Cli.linux-x64.zip"
      fi
      ;;
    *)
      echo "Unsupported OS for automatic DiscordChatExporter download: $os_name" >&2
      return 1
      ;;
  esac
}

install_exporter() {
  if exporter_installed; then
    echo "[setup] DiscordChatExporter.Cli already exists."
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to download DiscordChatExporter.Cli." >&2
    exit 1
  fi
  if ! command -v unzip >/dev/null 2>&1; then
    echo "unzip is required to extract DiscordChatExporter.Cli." >&2
    exit 1
  fi

  local asset tag url zip_path
  asset="$(detect_exporter_asset)"
  tag="$(curl -fsSL -H "User-Agent: discord-insight-platform-setup" https://api.github.com/repos/Tyrrrz/DiscordChatExporter/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
  url="https://github.com/Tyrrrz/DiscordChatExporter/releases/download/$tag/$asset"
  zip_path="${TMPDIR:-/tmp}/$asset"

  echo "[setup] downloading DiscordChatExporter.Cli..."
  mkdir -p "$EXPORTER_DIR"
  curl -fL "$url" -o "$zip_path"
  unzip -oq "$zip_path" -d "$EXPORTER_DIR"
  rm -f "$zip_path"
  chmod +x "$EXPORTER_DIR/DiscordChatExporter.Cli" 2>/dev/null || true

  if ! exporter_installed; then
    echo "DiscordChatExporter.Cli download finished, but executable was not found in: $EXPORTER_DIR" >&2
    exit 1
  fi
  echo "[setup] DiscordChatExporter.Cli installed to backend/tools/DiscordChatExporter.Cli"
}

cd "$BACKEND"
install_exporter

if [[ ! -x ".venv/bin/python" ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
fi

cd "$FRONTEND"
npm install
if [[ ! -f ".env.local" && -f ".env.local.example" ]]; then
  cp .env.local.example .env.local
fi

echo "[setup] done. Run ./scripts/start-dev.sh next."
