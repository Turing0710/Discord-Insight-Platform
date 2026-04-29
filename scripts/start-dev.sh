#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT_DIR/backend"
FRONTEND="$ROOT_DIR/frontend"

if [[ ! -x "$BACKEND/.venv/bin/python" ]]; then
  echo "Missing backend venv. Run ./scripts/setup.sh first."
  exit 1
fi

(cd "$BACKEND" && .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!
(cd "$FRONTEND" && npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT

echo "[start] backend:  http://127.0.0.1:8000/health"
echo "[start] frontend: http://127.0.0.1:3000"
wait
