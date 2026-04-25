#!/usr/bin/env bash
# Run the backend in dev mode. Frontend tooling TBD.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
  echo "venv not found at backend/.venv — run scripts/setup.sh first"
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate
uvicorn app.main:app --reload --port "${BACKEND_PORT:-8000}"
