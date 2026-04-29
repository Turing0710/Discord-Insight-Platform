#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "deploy/.env.prod" ]]; then
  echo "Missing deploy/.env.prod."
  exit 1
fi

echo "[update] pulling latest code..."
git pull --ff-only
echo "[update] rebuilding and restarting..."
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build
echo "[update] completed."
