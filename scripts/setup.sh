#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT_DIR/backend"
FRONTEND="$ROOT_DIR/frontend"

cd "$BACKEND"
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
