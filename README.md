# AlterEgo

> Your future, simulated.

LA Hacks 2026 · personal future simulation. A voiced conversation with yourself in twenty years.

See [`docs/CLAUDE.md`](docs/CLAUDE.md) for the canonical product spec, [`docs/CHAMPION_STRATEGY.md`](docs/CHAMPION_STRATEGY.md) for track and sponsor reasoning, and [`docs/PROJECT_BUILD_SUMMARY.md`](docs/PROJECT_BUILD_SUMMARY.md) for the build plan.

## Repo layout

```
alterego/
├── backend/        FastAPI service — /simulate, /chat, /chat/voice
├── frontend/       Vite + React 18 (lives on origin/frontend/initial-design)
├── agent/          Optional Fetch.ai uAgent sidecar (only if core stable)
├── oasis_ext/      Future direction (multi-agent OASIS layer; not wired in yet)
├── scripts/        setup.sh, dev.sh
├── docs/           CLAUDE.md, CHAMPION_STRATEGY.md, PROJECT_BUILD_SUMMARY.md
└── .env.example
```

## Setup

Requires Python 3.12+.

```bash
cp .env.example .env
# Fill ANTHROPIC_API_KEY (required) and ELEVENLABS_API_KEY (for voice)

./scripts/setup.sh         # creates backend/.venv and installs deps
./scripts/dev.sh           # runs FastAPI on :8000
```

OpenAPI docs at `http://localhost:8000/docs`.

## Architecture in one paragraph

A Vite + React frontend collects a 7-field intake and posts it to a stateless FastAPI backend. `POST /simulate` makes one Claude Opus 4.7 call that returns a full `SimulationData` payload — two precomputed twenty-year trajectories (high = current path, low = alternate work-hours path), each as six `Checkpoint` cards, plus a 25–50 word voiced opening line and three canned future-self replies. The frontend renders this through eight screens (landing → intake → processing → reveal → chat → timeline → slider → encore). `POST /chat` (text) and `POST /chat/voice` (ElevenLabs streaming audio) handle free-form follow-ups in the future-self voice. No database; no live multi-agent simulation; no real-time scheduler. Multi-agent and OASIS-driven simulation are future directions, not part of the MVP.

## Track strategy (short version)

- Primary general track: **Flicker to Flow**
- Tier A sponsors: ASUS GX10 (if access granted), ElevenLabs, Gemma
- Tier B add-ons: Figma Make, GoDaddy, Cloudinary
- Optional sponsor: Fetch.ai Agentverse (~100 LOC sidecar)
- Skip: Best Overall (mutually exclusive with general track), MongoDB Atlas (no DB in MVP)

Full reasoning in [`docs/CHAMPION_STRATEGY.md`](docs/CHAMPION_STRATEGY.md).

## Status

Scaffolded and backend implemented 2026-04-24. Hackathon judging 2026-04-26.
