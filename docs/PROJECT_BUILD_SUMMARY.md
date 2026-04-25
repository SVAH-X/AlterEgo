# AlterEgo — Build Summary

Last updated: April 24, 2026

## What ships at the demo

A polished eight-screen flow:

1. Landing — selfie upload prompt
2. Intake — 7 fields, ~90 seconds
3. Processing — 9.5s of cycling copy while the simulation generates
4. Reveal — aged portrait + voiced opening line
5. Chat — voice + text future-self interview
6. Timeline — drag scrubber, checkpoints reveal in sequence
7. Slider — change work hours, switch between two precomputed paths
8. Encore — side-by-side, "the same person twice"

## Architecture

**Frontend** — Vite + React 18 + plain TypeScript. No Next.js, no Three.js, no R3F, no Tailwind. State in-memory.

**Backend** — FastAPI, stateless. Two real endpoints behind health:
- `POST /simulate` — Profile in, SimulationData out (one Claude call generates both 6-checkpoint paths + opening voice line + canned replies)
- `POST /chat` — Profile + chat history + user text in, future-self reply out
- `POST /chat/voice` — same as /chat, returns audio bytes (ElevenLabs streaming)

**External APIs**
- Anthropic — `claude-opus-4-7` for the simulation call; `claude-sonnet-4-6` for chat replies
- ElevenLabs — voiced future self (warm, tired, honest)
- Cloudinary (optional) — share cards
- Replicate (optional, post-MVP) — SAM model for real face aging

## Data shapes (frontend `types.ts` is the contract)

```ts
type Tone = "neutral" | "warn" | "good";

interface Profile {
  name: string; age: number; occupation: string; workHours: number;
  topGoal: string; topFear: string; targetYear: number; presentYear: number;
}

interface Checkpoint {
  year: number; age: number;
  title: string; event: string; did: string; consequence: string;
  tone: Tone;
}

interface SimulationData {
  profile: Profile;
  ages: number[];                    // 5 ages from present to target
  checkpointsHigh: Checkpoint[];     // current-trajectory path (6 cards)
  checkpointsLow: Checkpoint[];      // alternate-hours path (6 cards)
  futureSelfOpening: string;         // 25–50 words, voiced
  futureSelfReplies: Record<string, string>;  // 3 canned Q→A pairs
}
```

Backend Pydantic models mirror these exactly so JSON crosses the wire without translation.

## Repo layout

```
alterego/
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI app, CORS, lifespan
│   │   ├── config.py            env-driven settings
│   │   ├── api/
│   │   │   ├── health.py
│   │   │   ├── simulate.py      POST /simulate
│   │   │   └── chat.py          POST /chat, POST /chat/voice
│   │   ├── models/
│   │   │   ├── profile.py       mirrors frontend
│   │   │   ├── checkpoint.py    mirrors frontend
│   │   │   ├── simulation.py    SimulationData
│   │   │   └── chat.py          ChatRequest / ChatMessage
│   │   ├── services/
│   │   │   ├── simulator.py     one big Claude call → SimulationData
│   │   │   ├── chat.py          chat-reply Claude call
│   │   │   └── voice.py         ElevenLabs streaming TTS
│   │   ├── routing/             AgentRouter abstraction (single-tier today; multi-tier ready)
│   │   └── prompts/
│   │       ├── simulator.py     system prompt for /simulate
│   │       └── future_self.py   system prompt for /chat
│   ├── requirements.txt
│   └── tests/
├── frontend/                    Vite + React 18 + TS (lives on origin/frontend/initial-design)
├── agent/                       Optional Fetch.ai uAgent sidecar (only if core is stable)
├── scripts/                     setup.sh, dev.sh
├── docs/                        CLAUDE.md, CHAMPION_STRATEGY.md, this file
└── README.md
```

## What's deliberately removed from earlier scaffolds

These existed in earlier directions and are no longer part of the build:

- `services/agent_graph.py`, `event_planner.py`, `scheduler.py`, `oasis_round.py`, `causal.py`, `reality_seed.py`, `interview.py` (legacy multi-step pipeline)
- `models/agent_card.py`, `models/event.py`, `models/interview.py` (legacy)
- `db/checkpoint_repo.py`, `db/session_repo.py`, `db/vector_repo.py` (no DB in MVP)
- `prompts/causal_extractor.py`, `prompts/character_cards.py` (multi-agent prompts)
- `oasis_ext/*` (kept as a future-direction module, not wired into the active build)
- LightGBM (removed entirely)
- MongoDB Atlas (in-memory state for MVP)

## Build priorities

1. Backend `/simulate` working end-to-end with Claude generating valid SimulationData JSON
2. Backend `/chat` returning grounded future-self replies
3. Backend `/chat/voice` streaming ElevenLabs audio
4. Frontend wired to call `/simulate` after intake (replacing `AE_DATA` hardcode for non-Sarah profiles)
5. Three pre-baked sample profiles cached on the frontend for the scripted demo
6. Replicate face aging integrated (replace picsum placeholders)
7. Backup video recorded

Stop at 7 unless every step is solid. Multi-agent / OASIS / persistence are post-hackathon work.

## Constraints (carry over from the project's soul)

- Honest, slightly uncomfortable tone. Not motivational.
- The "thriving" path still has shadows.
- The "struggling" path is dignified, not a caricature.
- No medical, financial, or deterministic claims.
- Causal language must be hedged: this is a simulated hypothesis, not real-world proof.
- World events (recessions, layoffs, climate, AI disruption) are baseline, not edge cases.
