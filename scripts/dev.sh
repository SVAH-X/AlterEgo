#!/usr/bin/env bash
# Run the backend in dev mode. Frontend tooling TBD.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

uv run uvicorn app.main:app --reload --port "${BACKEND_PORT:-8000}"
