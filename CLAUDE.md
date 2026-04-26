# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AlterEgo is a personal future simulator built for LA Hacks 2026. Users fill out a short intake form and receive a precomputed 20-year life trajectory delivered as streaming checkpoint cards, followed by a voiced conversation with their simulated future self.

## Commands

**Backend (FastAPI):**
```bash
./scripts/setup.sh                         # Create backend/.venv and install deps
./scripts/dev.sh                           # Run backend at http://localhost:8000

# Manual:
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Frontend (Vite + React):**
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
npm run build       # tsc -b && vite build
npm run typecheck   # Type-check only (no emit)
```

**Fetch.ai agent sidecar (optional, only for that track):**
```bash
cd agent && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python alterego_agent.py
```

**API docs:** `http://localhost:8000/docs`

## Architecture

The system is a **stateless two-endpoint backend** behind an **eight-screen frontend**. No database—the frontend owns `SimulationData` and passes it back with every `/chat` request.

### Data flow

1. User fills intake → `Profile` (name, age, occupation, workHours, topGoal, topFear, targetYear, presentYear, optional mbti, optional values dyads)
2. `POST /simulate` → streaming NDJSON pipeline (4 phases, see below) → `SimulationData`
3. Frontend caches `SimulationData`; passes it unchanged with every `POST /chat` call
4. `POST /chat/voice` takes the text reply from `/chat` and streams ElevenLabs mp3 chunks

### Streaming pipeline (`/simulate`)

The orchestrator in [backend/app/services/orchestrator.py](backend/app/services/orchestrator.py) yields NDJSON phases in order:

| Phase | What Claude does | Frontend effect |
|---|---|---|
| `counting` | Generates 3–12 agents (AgentSpec[]) in the user's life | Population bar animates |
| `plan` | Outlines events across the horizon (OutlineEvent[]) | Timeline pulse |
| `event` (×N) | Fills each outline slot into a Checkpoint | Cards stream in |
| `finalizing` | Writes futureSelfOpening + futureSelfReplies | "Almost done" state |
| `complete` | Full SimulationData JSON | Screen transitions |

### Inference router

[backend/app/routing/router.py](backend/app/routing/router.py) provides an `AgentRouter` abstraction. Tiers map to models:

- `FUTURE_SELF` → Claude Opus 4.7 (simulation orchestration)
- `HIGH_SIGNAL` → Claude Sonnet 4.6 (chat replies, manager/friend/family)
- `PEERS` → Claude Sonnet 4.6 (colleagues, industry voices)
- `NOISE` → Groq Llama 3.1 8B (throwaway accounts)

Set `INFERENCE_PLAN=A` in `.env` to route to a local GX10 instead (vLLM/Ollama via [backend/app/routing/plan_a_local.py](backend/app/routing/plan_a_local.py)).

### State-driven event triggering

[backend/app/services/state_model.py](backend/app/services/state_model.py) tracks 8 float aspects (work_intensity, financial_pressure, social_isolation, family_distance, health_strain, career_momentum, meaning_drift, relationship_strain). [backend/app/data/event_pool.json](backend/app/data/event_pool.json) contains 50+ pre-curated events with threshold triggers—an event fires when its required aspects cross their thresholds during the simulation.

### Frontend screen state machine

[frontend/src/App.tsx](frontend/src/App.tsx) manages 8 screens as an index. All screen components are stateless and props-driven via `ScreenProps`. Arrow keys navigate between screens; dev nav dots (bottom-right) allow jumping to any screen. Screens are split across [frontend/src/screens/screens-a.tsx](frontend/src/screens/screens-a.tsx) (landing → intake → processing → reveal) and [frontend/src/screens/screens-b.tsx](frontend/src/screens/screens-b.tsx) (chat → timeline → slider → encore).

## Key Types

Frontend [frontend/src/types.ts](frontend/src/types.ts) mirrors backend Pydantic models exactly:

```ts
type Tone = "neutral" | "warn" | "good"

interface Checkpoint {
  year: number; age: number; title: string
  event: string; did: string; consequence: string; tone: Tone
}

interface SimulationData {
  profile: Profile
  agedPortraits: AgedPortrait[]              // up to 5 high-trajectory portraits
  checkpointsHigh: Checkpoint[]              // current trajectory (typically 6 cards)
  futureSelfOpening: string                  // voiced reveal line
  futureSelfReplies: Record<string, string>  // 3 canned Q→A pairs
}
```

## Environment

Copy `.env.example` to `.env`. Required keys: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`. All models have env overrides—default models are set to Haiku 4.5 for dev/testing; override to Opus 4.7 / Sonnet 4.6 for demo.

## Tone Constraint

Every Claude prompt includes a `TONE_BLOCK` (defined in [backend/app/prompts/orchestration.py](backend/app/prompts/orchestration.py)) that enforces **honest, contemplative, non-motivational** voice. Never revise prompts in ways that soften or remove this constraint—the product thesis depends on it. The simulation shows dignified struggle and real tradeoffs, not inspiration.

## What Is Out of Scope for MVP

The following are explicitly deferred (see [docs/CLAUDE.md](docs/CLAUDE.md)):
- OASIS multi-agent layer (`oasis_ext/` is a stub, not wired in)
- MongoDB persistence
- Replicate image generation
- Three.js 3D portrait
- Real-time multi-agent turns during `/simulate`

The `agent/` Fetch.ai sidecar is optional (~100 LOC) and only relevant if pursuing that sponsor track.
