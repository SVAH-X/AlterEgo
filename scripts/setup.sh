#!/usr/bin/env bash
# AlterEgo — one-shot setup. Creates a venv and installs backend deps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking prereqs"
command -v python3 >/dev/null 2>&1 || { echo "python3 not found"; exit 1; }
PY_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
echo "    Python: $PY_VERSION (3.12+ recommended)"

if [ ! -f ".env" ]; then
  echo "==> .env not found — copying template"
  cp .env.example .env
  echo "    Fill in real API keys in .env before running the backend."
fi

echo "==> Creating venv at backend/.venv (if missing)"
if [ ! -d "backend/.venv" ]; then
  python3 -m venv backend/.venv
fi

echo "==> Installing backend deps"
# shellcheck disable=SC1091
source backend/.venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

echo
echo "==> Done."
echo "    Backend:  source backend/.venv/bin/activate && uvicorn app.main:app --reload --port 8000  (run from backend/)"
echo "    Or:       ./scripts/dev.sh"
echo "    Agent:    python -m venv agent/.venv && source agent/.venv/bin/activate && pip install -r agent/requirements.txt && python agent/alterego_agent.py  (optional)"
