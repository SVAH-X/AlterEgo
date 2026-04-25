# AlterEgo - OASIS-First Project Brief

Last updated: April 23, 2026

Core question:

> If I keep living inside this information environment, what kind of future am I drifting toward?

AlterEgo is a personal future simulator built around social-media dynamics. It should not be treated as a formula that predicts a life score. The product thesis is that a person's future is shaped by social signals, news, misinformation, workplace cues, support, silence, opportunity, and repeated small reactions inside an information environment.

The old rough demo used simple functions and LightGBM-style score anchors. That path is archived under `legacy/simple-function/` for historical reference only and is not part of the current build. The current direction is fully LLM-driven OASIS simulation; LightGBM has been removed entirely (no statistical anchor, no fallback role).

---

## Non-Negotiable Direction

1. OASIS (camel-oasis) is the core simulation substrate.
2. AlterEgo builds a specialized layer around customized OASIS for personal future simulation: personalized agent instantiation, real-news ingestion, tiered model routing per agent, checkpoint orchestration, and a causal-hypothesis extractor.
3. Vanilla OASIS is report-oriented and continuous. We restructure it around interactive checkpoints with pause / inspect / edit / resume. MiroFish is no longer in the build (deleted 2026-03-30).
4. The public output should emphasize events, social reactions, assumptions, and turning points, not raw scores.
5. Numeric state may exist internally for charts, branching, crisis detection, and resume logic, but it must not become the product's main claim.
6. "Causal" means simulated causal hypothesis inside the model world. Do not claim scientific causal proof.
7. After simulating to the target date, the user must be able to interview their future self, grounded in the simulated history.
8. Tiered inference via a backend-agnostic router. Plan B (default for the hackathon): hosted APIs mapped tier-for-tier — Claude Opus 4.7 (future self), Claude Sonnet 4.6 (high-signal relationships), Claude Haiku 4.5 (peers and industry voices), Groq llama-3.1-8b (noise accounts). Plan A (only if ASUS GX10 access is granted at the event): same tiers backed by local open-weight models from the Llama / Qwen / Gemma families; specific model selection deferred until hardware is in hand. The router swaps backends via config; nothing else in the codebase depends on where inference lives. If GX10 access never lands, the product still ships on Plan B — only the ASUS prize is forfeited. Different characters continue to use different models or settings to enrich personality, voice, and behavior.

---

## Why OASIS

OASIS is a social media simulator: agents, social actions, recommendation/feed dynamics, posts, comments, likes, interaction logs, and interviews. That makes it a better fit than a fixed prediction function for AlterEgo's thesis.

The world is changing quickly and nonlinearly. Social media is where news, rumors, professional signals, emotional contagion, misinformation, validation, and isolation collide. AlterEgo should use that virtual social world as the simulation environment.

OASIS is not enough by itself. It simulates social interaction, but AlterEgo must provide:

- personal profile construction
- agent graph construction
- future event scheduling
- checkpoint selection
- simulation memory
- causal-hypothesis extraction
- user correction and resume
- future-self interview grounding

---

## Correct Use Of Causal Language

This project can talk about causal chains inside a simulation:

- "The model hypothesizes that this event increased burnout risk because..."
- "In this simulated branch, the manager's post led to..."
- "This checkpoint is a turning point under the current assumptions..."

This project must not claim:

- proven real-world causality
- medical certainty
- financial certainty
- that the simulated future will happen
- that OASIS objectively predicts a person's life

Every major checkpoint should expose assumptions and allow correction. If the simulated user does something unrealistic, the real user can interrupt, edit the assumption, and resume from that point.

---

## Product Pipeline From Zero To Completion

### 0. Intake

Collect a structured profile:

- name
- age
- nationality/current country
- occupation
- industry
- work pattern
- sleep/recovery pattern
- financial behavior
- short-term goal
- long-term goal
- self-description
- target date
- optional constraints: "things I would never do", important people, known life facts

The target date can be months, years, or a life milestone. The simulator should not assume every month needs full OASIS execution.

### 1. Reality Seed

Build initial world context from:

- current news
- country context
- industry context
- user goals
- user risk factors
- relevant social-media/information-environment signals

Use GDELT, RSS/news APIs, curated scenario libraries, and LLM synthesis. Source labels should be preserved where possible.

### 2. Agent Graph

Build a personalized OASIS social graph. Minimal graph:

- user / protagonist
- manager or professional authority
- colleague or peer
- close friend
- family member
- industry/media voices
- optional misinformation/noise accounts

Characters can use different hosted model APIs or model configurations. This is intentional: it can make personalities less uniform. Keep model routing explicit so behavior is debuggable.

### 3. Event Planner

Generate candidate future events. Events may be:

- macro: layoffs, policy changes, wars, inflation, AI disruption, housing shocks
- industry: funding freeze, regulation, new tools, market shifts
- social: conflict, support, silence, network changes
- personal: promotion, burnout, relocation, breakup, illness, opportunity
- endogenous: generated when simulated internal state crosses a threshold

Each candidate event should have:

- title
- description
- source or rationale
- estimated time window
- relevance to profile
- uncertainty
- possible triggers
- expected affected people/agents
- assumptions

### 4. Checkpoint Scheduler

Use discrete-event simulation logic rather than fixed monthly brute force.

The scheduler should choose the next checkpoint based on:

- event salience
- user vulnerability
- expected impact
- uncertainty
- novelty
- time since last checkpoint
- need for user validation

Quiet periods can be summarized as drift. High-impact periods get full OASIS rounds. Add periodic check-ins even if nothing dramatic happens, so the user can interrupt and correct.

### 5. OASIS Simulation Round

At each selected checkpoint:

1. Inject the event into the social world.
2. Let agents post, comment, like, ignore, amplify, misread, or support.
3. Record the social feed and interaction history.
4. Let the simulated user react.
5. Preserve enough state to resume later.

The output is not just "score changed". The output is the lived social evidence of the checkpoint.

### 6. Causal-Hypothesis Extractor

Read the OASIS interaction logs and produce:

- what happened
- who influenced whom
- what the simulated self did
- what assumptions were used
- which events changed the branch
- what remains uncertain
- what the user can correct

Internal numeric state is allowed for graphing and branch management, but the primary artifact is a causal-hypothesis ledger.

### 7. Checkpoint UI

During a long simulation, show checkpoint cards so the user is not waiting on a black box:

- "3 months later..."
- key social posts
- key external events
- simulated self action
- consequences
- assumptions
- continue / interrupt / edit / branch

If the target date is 5 years away, the user may interrupt at month 3, correct an unrealistic action, and resume to year 5 from the edited state.

### 8. Resume And Branching

User edits must become first-class simulation state:

- "I would never quit there."
- "My friend would not say that."
- "I would move cities earlier."
- "I want to change sleep/work behavior starting now."

After correction, rerun from the checkpoint, not from the beginning unless necessary.

### 9. Target-Date Completion

When the simulation reaches the target date, produce:

- final future snapshot
- major turning points
- assumptions that mattered most
- avoidable risks
- alternate branch suggestions
- timeline of checkpoints
- social evidence trail

Do not reduce the final output to a simple score report.

### 10. Future-Self Interview

After target-date simulation, the user can talk with the simulated future self.

The future self must be grounded in:

- checkpoint history
- social feed history
- user corrections
- important relationships
- final state
- branch assumptions

If OASIS interview support is unavailable, fallback to a hosted LLM prompt that includes the same simulation memory. The experience should still feel like talking to someone who lived through the simulated history, not a generic motivational chatbot.

---

## Legacy Simple Function System (archived)

The old system lived at:

- `backend/app/services/predictor.py`
- `backend/app/services/monthly_simulator.py`
- `backend/training/*`
- `backend/trained_models/*`

It used score anchors at 1, 3, and 5 years and a formula-driven monthly drift simulator. It is archived under `legacy/simple-function/` for reference only — not used as fallback, not used for calibration, not used as a sanity check. The current build is fully LLM-driven OASIS simulation. LightGBM has been removed entirely.

---

## Active Technical Priorities

1. Rename/reframe current simulation UI around checkpoints, not score prediction.
2. Add social feed rendering for OASIS events.
3. Build a checkpoint ledger data structure.
4. Add interrupt/edit/resume UX.
5. Make future-self interview consume simulation memory.
6. Keep simple-function code available as fallback only.
7. Make model/API routing explicit for agents.
8. Preserve source/rationale metadata for future events.

---

## Prize And Track Strategy

Sources re-checked April 24, 2026:

- LA Hacks Devpost: https://la-hacks-2026.devpost.com/
- LA Hacks tracks: https://live.lahacks.com/tracks
- Fetch.ai LA Hacks hackpack: https://www.fetch.ai/events/hackathons/la-hacks-2026/hackpack

### Critical track rules (organizer ruling, 2026-04-24)

- Apply to only ONE general track. Exception: Fetch.ai requires also selecting one LA Hacks general track.
- Cannot win a general track AND Best Overall. Mutually exclusive.
- CAN win multiple company/sponsor challenges plus one general track.

### Decision (revised 2026-04-24)

Primary general track: **Flicker to Flow.** Frame: "we turn the friction of an unplanned life into a clear, honest picture of where it leads — and what changing one habit, decision, or assumption does to the trajectory." Best Overall contention is dropped (general track XOR Best Overall).

Fetch.ai is **optional** — pursue only if the core product is stable with time to spare. Integration is small (~100 LOC mailbox-mode uAgent sidecar bridging FastAPI ↔ ASI:One Chat Protocol; no public endpoint required), but not architecturally required and not committed to in advance.

### Tier A — shape the product

- **ASUS GX10:** primary hardware target if access is granted at the event. Plan A tiered local inference lives here.
- **ElevenLabs:** voiced future-self interview (alongside text); highest demo impact per hour of work.
- **Gemma:** free byproduct of Plan A tiered inference if GX10 is in play.

### Tier A.5 — the one general track

- **Flicker to Flow:** "scattered future-anxiety → clear trajectory." The chaos of an unplanned life becomes inspectable checkpoints and concrete course corrections.

### Optional — pursue only with spare time

- **Fetch.ai Agentverse:** thin uAgent sidecar (mailbox mode, ~100 LOC). Architecturally non-invasive — the sidecar wraps existing backend endpoints with the Fetch.ai Chat Protocol. Top prize $2,500.

### Tier B — easy add-ons

- Figma Make Challenge: short writeup of how Figma Make was used in the workflow.
- MLH Best Domain (GoDaddy): register a thematic domain.
- MLH Best Use of MongoDB Atlas: our single database for checkpoint ledger, agent state, and vector search.
- Cloudinary: share cards and timeline media.

### Tier C — compete passively (special awards, likely stackable)

- Best UI/UX, Best Social Impact Hack, Organizers' Choice, Sponsormaxxing, Most Questionable Use of 36 Hours.

### Tier D — skip

- Best Overall (excluded by general-track choice).
- Sustain the Spark, Light the Way, Catalyst for Care (only one general track allowed).
- Cognition, Roblox, World U, Zetic, Arista, Solana, Vultr, Best Hardware Hack, OmegaClaw Skill Forge — wrong domain, wrong form factor, or conflicts with ASUS framing.

Do not chase unrelated prizes if they distort the product. Do not add features (sustainability, education, etc.) purely to qualify for additional tracks. Focused excellence beats theme-coverage.

---

## Tone And Safety

Tone:

- serious
- grounded
- honest
- slightly uncomfortable
- no cheerleading
- no fake certainty

The app should make the future inspectable, not inspirational. It should show assumptions and let the user correct them.

Safety constraints:

- no deterministic life claims
- no medical diagnosis
- no investment advice
- no claims of guaranteed prediction accuracy
- no hidden "the AI knows best" posture
- user correction must be respected as simulation input

---

## One-Sentence Product Definition

AlterEgo is an OASIS-powered personal future simulator where social information dynamics generate inspectable life checkpoints, and the user can interrupt, correct, resume, and finally interview the future self who lived through that simulated branch.
