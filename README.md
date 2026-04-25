# AlterEgo

> Your future, simulated.

LA Hacks 2026 · OASIS-grounded personal future simulation.

See [`AlterEgo Project Brief.md`](AlterEgo%20Project%20Brief.md) for the product brief and [`docs/`](docs/) for the strategy and build docs.

## Repo layout

```
alterego/
├── backend/        FastAPI service — simulation, routing, OASIS orchestration, voice
├── frontend/       Next.js app (TBD — tooling not yet selected)
├── agent/          Optional Fetch.ai uAgent sidecar (mailbox mode, ~100 LOC)
├── oasis_ext/      Our customizations on top of `pip install camel-oasis`
├── scripts/        setup.sh, dev.sh, seed_world_events.py
├── docs/           CLAUDE.md, CHAMPION_STRATEGY.md, PROJECT_BUILD_SUMMARY.md
├── legacy/         Archived simple-function direction (reference only)
└── AlterEgo Project Brief.{md,pdf}
```

## Setup

Requires Python 3.12+. MongoDB Atlas connection string in `.env` (or run a local Mongo separately).

```bash
# 1. Copy env template and fill in keys
cp .env.example .env
# Edit .env with real ANTHROPIC_API_KEY, GROQ_API_KEY, MONGODB_URI, etc.

# 2. One-shot: create venv and install backend deps
./scripts/setup.sh

# 3. Run backend (dev)
./scripts/dev.sh
```

The frontend is intentionally empty until tooling is selected.

## Architecture in one paragraph

A FastAPI backend orchestrates a customized OASIS social simulation around a user's profile. Agents (manager, friends, family, peers, noise accounts) react to real-world events injected from GDELT. A discrete-event scheduler picks high-salience checkpoints; at each, OASIS runs a full social round and a structured-output LLM extracts a causal-hypothesis ledger. The user can interrupt, edit, and resume at any checkpoint. At target date, the user interviews a voiced future self (ElevenLabs + text) grounded in the full simulation memory. All LLM calls go through a tiered router (Plan B = hosted APIs by default; Plan A = local open-weights on ASUS GX10 if hardware in hand). MongoDB Atlas stores the checkpoint ledger and powers vector search for interview grounding.

## Track strategy (short version)

- Primary general track: **Flicker to Flow**
- Tier A sponsors: ASUS GX10, ElevenLabs, Gemma
- Tier B add-ons: Figma Make, GoDaddy, MongoDB Atlas, Cloudinary
- Optional sponsor: Fetch.ai Agentverse (~100 LOC sidecar, only if core stable)

Full reasoning in [`docs/CHAMPION_STRATEGY.md`](docs/CHAMPION_STRATEGY.md).

## Status

Scaffolded 2026-04-24. Hackathon judging 2026-04-26.
