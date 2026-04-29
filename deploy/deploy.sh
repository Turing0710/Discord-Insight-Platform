#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "backend/.env" ]]; then
  echo "Missing backend/.env. Copy backend/.env.example first."
  exit 1
fi

if [[ ! -f "deploy/.env.prod" ]]; then
  echo "Missing deploy/.env.prod. Copy deploy/.env.prod.example first."
  exit 1
fi

if [[ ! -f "backend/tools/DiscordChatExporter.Cli/DiscordChatExporter.Cli.exe" ]]; then
  echo "Missing DiscordChatExporter.Cli.exe in backend/tools/DiscordChatExporter.Cli/"
  exit 1
fi

echo "[deploy] building and starting services..."
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build
echo "[deploy] done."
echo "[deploy] check status with:"
echo "docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml ps"
