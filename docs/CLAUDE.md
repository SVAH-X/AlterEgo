# AlterEgo — Project Brief (canonical)

Last updated: April 24, 2026

The frontend branch (`origin/frontend/initial-design`) is the source of truth for what the product currently is. This doc reflects that reality, not earlier OASIS-grand-vision direction.

## One-sentence definition

AlterEgo is a personal future simulator: a user fills in a 7-field intake, and the system generates two precomputed twenty-year trajectories (their current path and an alternate "what if you worked fewer hours" path), then lets them have a voiced conversation with their simulated future self.

## What ships

A demo flow in eight screens:

1. **Landing** — "See where your life is heading." One button: upload selfie.
2. **Intake** — seven fields one at a time: name, age, occupation, workHours, topGoal, topFear, targetYear. ~90 seconds.
3. **Processing** — six cycling lines for ~9.5s while the simulation generates.
4. **Reveal** — aged portrait + voiced opening line ("It's me. I know that's strange.").
5. **Chat** — voice + text future-self interview. Three suggested questions; free-form input also works.
6. **Timeline** — drag scrubber from present to target year. Six checkpoint cards reveal in sequence as the portrait ages.
7. **Slider** — change one variable (work hours, 30–80). Optimistic-path probability shifts. The other precomputed path becomes visible.
8. **Encore** — side-by-side, the same person twice. "If nothing changes" vs the alternate.

## Tone

Serious, contemplative, melancholic but compassionate. Honest, not motivational. The world is hard — economic instability, political turbulence, real disruptions. AlterEgo shows that, doesn't sanitize. The "struggling" path is dignified; the "thriving" path still has shadows. The feeling we design for is **clarity**, not motivation.

## Architecture (current, MVP)

```
Browser ──► Vite/React frontend ──► FastAPI backend ──┬──► Anthropic API (one big simulation call + chat replies)
                                                       └──► ElevenLabs (voice for the future self)
```

Stateless backend for MVP. The frontend holds the `SimulationData` returned from `/simulate` and passes chat history with each `/chat` call.

### Endpoints

- `GET  /health` — liveness check
- `POST /simulate` — `Profile` in, `SimulationData` out (the main call; one Claude completion that produces both trajectories + opening line + canned replies)
- `POST /chat` — `Profile + history + user_text` in, reply text out (used for free-form chat after the suggested questions)
- `POST /chat/voice` — same input as `/chat`, returns audio bytes (mp3) via ElevenLabs streaming

### Data shapes (mirror frontend `types.ts` exactly)

```python
class Profile:
    name: str
    age: int
    occupation: str
    workHours: int
    topGoal: str
    topFear: str
    targetYear: int
    presentYear: int

class Checkpoint:
    year: int
    age: int
    title: str
    event: str
    did: str
    consequence: str
    tone: Literal["neutral", "warn", "good"]

class SimulationData:
    profile: Profile
    ages: list[int]                            # five ages from present to target
    checkpointsHigh: list[Checkpoint]          # current-trajectory path (six cards)
    checkpointsLow: list[Checkpoint]           # alternate-hours path (six cards)
    futureSelfOpening: str                     # 25–50 words, voiced reveal line
    futureSelfReplies: dict[str, str]          # canned answers to 3 suggested questions
```

## Inference

Single backend, single tier for the MVP. Both `/simulate` and `/chat` route through the same `AgentRouter` abstraction so future multi-tier work plugs in cleanly, but in practice today everything calls Claude.

- **Plan B (default for hackathon):** Anthropic `claude-opus-4-7` for the simulation call (high quality, runs once per session); `claude-sonnet-4-6` for chat replies (cheaper, faster).
- **Plan A (only if ASUS GX10 access is granted):** same router interface, local open-weights via vLLM/Ollama. Specific models deferred until hardware bringup. The product does not depend on Plan A — losing it just forfeits the ASUS prize.

## What's deliberately OUT of scope for the demo

These existed in earlier briefs and are no longer in the build:

- OASIS multi-agent social simulation
- Personalized agent graph with character cards
- Discrete-event checkpoint scheduler
- Causal-hypothesis extractor service
- Real-news ingestion (GDELT)
- MongoDB Atlas (in-memory state for MVP)
- Ready Player Me 3D avatar (frontend uses 2D portrait placeholders for now)
- Replicate face aging (placeholder portraits in the current frontend)
- Tiered routing across multiple model providers
- Fetch.ai Agentverse uAgent sidecar (still optional; only if core stable)
- LightGBM (removed entirely)

These can be re-added as layered enhancements after the MVP ships:

1. Real selfie → aged portrait via Replicate (replaces picsum placeholders)
2. Ready Player Me + Three.js for the 3D avatar (replaces 2D portrait)
3. Multi-agent counting orchestrator + visible inter-agent dialogue in checkpoint cards
4. OASIS as the simulation substrate underneath checkpoints
5. MongoDB for persistence
6. Fetch.ai sidecar for Agentverse track

## Tone & safety

The app should make the future inspectable, not inspirational. It should show assumptions and let the user correct them.

Forbidden:
- deterministic life claims
- medical diagnosis or certainty
- investment advice
- claims of guaranteed prediction accuracy
- "the AI knows best" posture

The simulation IS a hypothesis inside a model world. Every claim that sounds causal is a *simulated* causal hypothesis, never real-world proof.

## Track strategy (short version)

- **Primary general track:** Flicker to Flow ("we turn the friction of an unplanned life into a clear, honest picture of where it leads — and what changing one habit, decision, or assumption does to the trajectory")
- **Tier A sponsors:** ASUS GX10 (if access granted), ElevenLabs (voiced future-self), Gemma (free if Plan A is in play)
- **Tier B add-ons:** Figma Make, GoDaddy domain, Cloudinary (share cards)
- **MongoDB Atlas:** dropped from the MVP — re-add only if persistence becomes necessary
- **Optional:** Fetch.ai Agentverse (~100 LOC mailbox sidecar, only if core stable)
- **Skip:** Best Overall (general-track XOR), other general tracks, Cognition, Roblox, World U, Zetic, Arista, Solana, Vultr, Best Hardware Hack

Full reasoning in `CHAMPION_STRATEGY.md`.

## One-sentence product definition

AlterEgo is a stateless, two-call backend behind a polished eight-screen frontend: one Claude call generates two precomputed twenty-year trajectories from a 7-field intake; a second Claude call (with ElevenLabs synthesis) lets the user have a voiced conversation with their simulated future self.
