# AlterEgo

[![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)](https://innovationlab.fetch.ai/)
[![Built for LA Hacks 2026](https://img.shields.io/badge/LA%20Hacks-2026-d4a574)](https://la-hacks-2026.devpost.com/)
[![Claude](https://img.shields.io/badge/Anthropic-Claude%204.x-c87f5b)](https://www.anthropic.com/)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Voice%20Clone-1f1f1f)](https://elevenlabs.io/)
[![Fetch.ai](https://img.shields.io/badge/Fetch.ai-Agentverse-3D8BD3)](https://agentverse.ai/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Image-4285f4)](https://ai.google.dev/)

> Twenty years from now, who's looking back?

**AlterEgo** is a personal future simulator. Tell it about who you are today — work,
hours, ambition, fear — and it walks the years forward, simulating the choices
you'll make and where they take you. Then it lets you talk to the person waiting
at the other end.

Honest, not motivational. The future-self isn't a cheerleader. She's *you*
twenty years on, and she's tired, and she remembers what mattered.

---

## Live agent

| | |
|---|---|
| **Agent name** | `alterego` |
| **Agent address** | `agent1q0v3wrfcdhk6pu6psjmts7dneenwvut9pd6y4ye4xj7qky2tseu3ka5we5p` |
| **Agentverse** | [Find on Agentverse](https://agentverse.ai/) |
| **ASI:One** | [Chat with AlterEgo](https://asi1.ai/) |

The Fetch.ai uAgent runs in mailbox mode and is fully discoverable on ASI:One.
Just say `hi` to begin.

---

## What it actually does

1. **Selfie** — capture or upload (skippable; blurred placeholder if skipped).
2. **Intake** — seven short questions: name, age, occupation, work hours,
   top goal, top fear, MBTI (optional). Voice-enabled on every field; the
   intake samples become the corpus for your future-self's cloned voice.
3. **Simulation** — about ninety seconds. The backend orchestrates a
   multi-phase, multi-tier Claude pipeline: agent count → event outline →
   detailed checkpoint cards → finalize → alternate-trajectory → ten aged
   portraits (Gemini 2.5 Flash). Streamed live as NDJSON; the frontend
   narrates years as they emerge.
4. **Reveal** — the future-self speaks. ElevenLabs streams her voice in
   real time, in your cloned voice if you spoke during intake.
5. **Timeline** — scrub through twenty years as cards. *Change this moment*
   on any year to branch a counterfactual: the trajectory rewrites from
   that point forward, preserving everything before it.
6. **Chat** — free-form conversation with the future-self, grounded in
   her trajectory. Text or voice mode.

---

## Why it's not a fairy tale

Every Claude prompt carries a `TONE_BLOCK` constraint: *serious, contemplative,
lived-in. Not cheerful, not despairing.* The simulator shows dignified struggle
and real tradeoffs — economic instability, AI disruption, climate stress, real
losses people don't plan for — as baseline, not as edge cases. When the user
asks *what should I change?*, the future-self gives 1–3 specific things grounded
in her trajectory, not generic advice.

The product thesis depends on this. A motivational version would lie.

---

## Architecture

```
┌─ React frontend (Vite + TS) ──────────────────────────────────────┐
│  8 screens: landing → selfie → intake → processing →              │
│             reveal → timeline → chat → end                        │
│  Voice: SpeechRecognition (STT), MediaRecorder (clone corpus),    │
│         ElevenLabs streaming TTS                                  │
└──────────────────────────────────┬────────────────────────────────┘
                                   │ NDJSON streaming
┌──────────────────────────────────▼────────────────────────────────┐
│  FastAPI backend                                                  │
│  POST /simulate         multi-phase NDJSON: counting → plan →     │
│                         event × N → finalizing → complete →       │
│                         portrait × 10                             │
│  POST /simulate/branch  same, but preserves pre-intervention      │
│                         events; replans years after the chosen    │
│                         year under the user's counterfactual      │
│  POST /chat             text reply from the future-self           │
│  POST /chat/voice       same, streamed as ElevenLabs mp3          │
│  POST /voice/clone      ElevenLabs Instant Voice Clone            │
└─────┬─────────────────┬─────────────────┬────────────────────┬────┘
      │                 │                 │                    │
      ▼                 ▼                 ▼                    ▼
  Anthropic        ElevenLabs         Gemini 2.5         Groq Llama
  Opus 4.7         TTS / STT /        Flash Image        3.1 8B
  Sonnet 4.6       Voice Clone        (10 portraits)     (NOISE tier)
  Haiku 4.5

┌────────────────────────────────────────────────────────────────────┐
│  Fetch.ai uAgent sidecar (mailbox mode, ASI:One-discoverable)      │
│  Wraps the backend as a Chat Protocol agent: 7-question intake →   │
│  narrated streaming simulation → free-form interview               │
└────────────────────────────────────────────────────────────────────┘
```

### Inference router

Tiered routing in [backend/app/routing/router.py](backend/app/routing/router.py).
Each agent role maps to a model based on how much its voice matters:

| Tier | Model | Used for |
|---|---|---|
| `FUTURE_SELF` | Claude Opus 4.7 | simulation orchestration, planner |
| `HIGH_SIGNAL` | Claude Sonnet 4.6 | future-self chat, manager/friend/family voices |
| `PEERS` | Claude Sonnet 4.6 | colleagues, industry voices |
| `NOISE` | Groq Llama 3.1 8B | throwaway accounts |

### State-driven event triggering

[backend/app/services/state_model.py](backend/app/services/state_model.py)
tracks 8 floats: work intensity, financial pressure, social isolation, family
distance, health strain, career momentum, meaning drift, relationship strain.
[backend/app/data/event_pool.json](backend/app/data/event_pool.json) is a
hand-curated pool of ~300 life events with threshold triggers. An event arms
when its required aspects cross thresholds — the planner walks year-by-year,
deciding whether to fire armed events based on narrative coherence.

Branched re-runs at `/simulate/branch` preserve the exact pre-intervention
checkpoints and only replan the years after the chosen moment.

---

## Sponsors integrated

| Sponsor | What we use it for |
|---|---|
| **Anthropic Claude** | Multi-tier orchestration: Opus 4.7 plans the trajectory, Sonnet 4.6 voices the future-self, Haiku 4.5 fills checkpoint detail |
| **ElevenLabs** | Streaming TTS for the future-self voice; STT for voice mode; Instant Voice Clone from intake samples (your own voice, 20 years older) |
| **Fetch.ai Agentverse** | uAgent in mailbox mode with ASI:One Chat Protocol — full conversational AlterEgo via ASI:One |
| **Google Gemini** | `gemini-2.5-flash-image` generates 10 aged portraits per simulation (5 high path + 5 low alternate path) |
| **Groq** | Fast inference for the NOISE tier (low-importance throwaway agent voices) |

---

## Run locally

**Requires Python 3.10+** (the agent's `uagents-core.contrib.protocols.chat` module needs it).

### 1. Backend (port 8000)

```bash
cp .env.example .env
# Fill: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, GEMINI_API_KEY, GROQ_API_KEY

cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs at `http://localhost:8000/docs`.

### 2. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

### 3. Fetch.ai agent (port 8001, optional)

```bash
cd agent
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Fill: AGENT_SEED (any random string), AGENTVERSE_API_KEY

python alterego_agent.py
```

The agent prints its address + an inspector URL on startup. Open the inspector
URL once, click **Connect → Mailbox**, and the agent registers itself with
your Agentverse account. After that, search for it on
[ASI:One](https://asi1.ai/) and chat.

See [agent/README.md](agent/README.md) for the full agent setup and
[agent/AGENT_PROFILE.md](agent/AGENT_PROFILE.md) for the public-facing profile
copy.

---

## Submitted to

**Primary track:**
- **Catalyst for Care** — wellness / mental-health framing

**Sponsor challenges:**
- **Fetch.ai: Agentverse — Search & Discovery of Agents** ($5,000)
- **MLH: Best Use of ElevenLabs** (voice cloning + streaming TTS)
- **MLH: Best Use of Gemma** (NOISE-tier inference) *— if implemented*
- **MLH: Best Domain from GoDaddy Registry** *— if implemented*

**Special prizes:**
- High Quality Sponsormaxxing — five sponsors integrated meaningfully
- Best UI/UX — serif-driven, melancholic palette, no inspirational fluff
- Organizers' Choice
- Best Social Impact

---

## Repo layout

```
alterego/
├── backend/         FastAPI: /simulate, /simulate/branch, /chat, /chat/voice, /voice/*
│   ├── app/
│   │   ├── api/         route handlers
│   │   ├── models/      Pydantic models (Profile, SimulationData, Checkpoint, AgedPortrait)
│   │   ├── prompts/     orchestration prompts (with the TONE_BLOCK)
│   │   ├── routing/     tiered model router
│   │   └── services/    orchestrator, state model, voice, portraits
│   └── tests/
├── frontend/        Vite + React 18 + TS — 8 screens, voice mode, intervention rewrites
│   └── src/
│       ├── screens/     screen components
│       ├── voice/       MicButton, VoiceContext, TTSPlayer
│       └── lib/         api client, portrait helpers
├── agent/           Fetch.ai uAgent for Agentverse / ASI:One
│   ├── alterego_agent.py
│   └── AGENT_PROFILE.md   public profile copy for Agentverse
├── docs/            CLAUDE.md (canonical spec)
└── scripts/         setup.sh, dev.sh
```

---

## Status

Built at LA Hacks 2026 (April 25–26, 2026). Submission live. Demo video in the
Devpost listing.
