#!/usr/bin/env bash
# AlterEgo — one-shot setup. Installs backend deps and verifies env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking prereqs"
command -v uv >/dev/null 2>&1 || {
  echo "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
}
command -v python3 >/dev/null 2>&1 || { echo "python3 not found"; exit 1; }

if [ ! -f ".env" ]; then
  echo "==> .env not found — copying template"
  cp .env.example .env
  echo "    Fill in real API keys in .env before running the backend."
fi

echo "==> Installing backend deps (uv sync)"
cd "$ROOT/backend"
uv sync

echo
echo "==> Done."
echo "    Backend:  cd backend && uv run uvicorn app.main:app --reload --port 8000"
echo "    Frontend: (tooling TBD)"
echo "    Agent:    cd agent && uv sync && uv run python alterego_agent.py  (optional)"
