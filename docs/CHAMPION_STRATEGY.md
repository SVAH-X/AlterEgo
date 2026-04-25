# AlterEgo - OASIS-First Strategy

Last updated: April 23, 2026

This document replaces the old function-prediction champion strategy. The current direction is OASIS-first: simulate a person's future through social information dynamics, checkpoint the important periods, and let the user interrupt and resume.

---

## Product Thesis

The future is not just a curve fit from demographics. It is shaped by the information environment a person lives inside: workplace signals, breaking news, rumors, social validation, silence, support, misinformation, opportunity, and stress.

AlterEgo uses OASIS as a social-media simulation substrate and adds a personal future layer around it:

- event planning
- adaptive checkpoint scheduling
- agent graph construction
- simulation memory
- causal-hypothesis extraction
- interrupt/edit/resume
- future-self interview

The old simple-function demo is archived under `legacy/simple-function/`.

---

## Architecture

```text
User intake
  -> reality seed
  -> personalized social graph
  -> candidate event planner
  -> checkpoint scheduler
  -> OASIS social simulation round
  -> causal-hypothesis extractor
  -> checkpoint UI
  -> user interrupt/edit/resume
  -> target-date snapshot
  -> future-self interview
```

### Why Customized OASIS, Not Vanilla

We build directly on camel-oasis (a customized OASIS fork). Vanilla OASIS is report-oriented, runs continuously, and is not designed for user checkpoint correction. Our customizations restructure it for AlterEgo's interactive loop:

- personalized agent instantiation from intake
- real-news ingestion (GDELT + curated feeds → posts)
- tiered model routing per agent
- checkpoint orchestration with pause / inspect / edit / resume
- causal-hypothesis extractor reading interaction logs

MiroFish was previously considered but is no longer in the build (deleted 2026-03-30).

### Why Not Simple Functions

Simple functions can be useful for fallback and calibration. They are not enough for the product claim.

AlterEgo's differentiator is not "we output a score." It is "we simulate the social information environment and show the chain of events that produced this branch."

---

## Causal-Hypothesis Standard

Use causal language carefully.

Allowed:

- simulated causal chain
- causal hypothesis
- model-world explanation
- "under these assumptions"

Forbidden:

- proof that X caused Y in the real world
- guaranteed prediction
- medical certainty
- financial certainty
- claims that OASIS objectively knows the user's future

Every important checkpoint should expose assumptions and allow correction.

---

## Core Demo

The demo should show:

1. User enters a profile and target date.
2. AlterEgo builds a social world around the user.
3. The app simulates only important checkpoints, not every empty month.
4. Each checkpoint shows posts/reactions/events and the simulated self's behavior.
5. User interrupts a checkpoint and corrects an unrealistic action.
6. Simulation resumes from the edited state.
7. At the target date, the user receives a final future snapshot.
8. User interviews the future self grounded in the simulated history.

The strongest demo line:

> AlterEgo does not predict your future with a formula. It simulates the information environment you live in, shows the turning points, and lets you correct the assumptions before continuing.

---

## Checkpoint Scheduling

Use discrete-event simulation principles. Time should jump to meaningful events instead of forcing a full OASIS round for every month.

A checkpoint is selected when:

- a macro or personal event is high salience
- the user is vulnerable to that event
- uncertainty is high enough to merit inspection
- too much quiet time has passed
- internal state crosses a threshold
- the user asks to inspect or intervene

Quiet periods become summarized drift. Important periods become OASIS rounds.

---

## Future-Self Interview

This is not optional. It is one of the strongest product moments.

The future self should know:

- the checkpoint timeline
- major social posts and reactions
- user corrections
- branch assumptions
- important relationships
- final target-date state

Fallback is allowed if OASIS interview is unavailable, but fallback prompts must still include the simulation memory.

---

## API And Model Strategy

Tiered inference through a single backend-agnostic router. The router maps agent tiers to backends; nothing else in the codebase cares where inference happens.

### Plan B — hosted APIs (default for the hackathon)

This is what we build against. Same router interface as Plan A, mapped tier-for-tier so agent behavior stays comparable if we hot-swap.

- future self: Claude Opus 4.7
- high-signal relationships (manager, close friend, family): Claude Sonnet 4.6
- peers / industry voices: Claude Haiku 4.5
- noise / misinformation: Groq llama-3.1-8b
- causal-hypothesis extractor: one mid-tier model with structured-output prompting

### Plan A — local, on ASUS GX10 (only if access is granted at the event)

128GB unified memory on the GX10 (GB10 Grace Blackwell Superchip) lets the future-self model stay resident while other tiers swap around it. OpenAI-compatible endpoints served via vLLM / llama.cpp / Ollama.

Specific model selection deferred until the hardware is in hand. Candidates from the Llama / Qwen / Gemma open-weight families, sized to the four-tier mapping (largest for the future self, mid-tier for high-signal relationships, mid-small for peers, small for noise). Final choices made after the first hardware bringup.

### Implementation discipline

- Plan B is the build. We ship on it.
- If GX10 access is granted, hot-swap to Plan A via a config flag — no refactor. Agent cards, simulation code, checkpoint ledger, UI, and interview code must not import model-specific libraries directly.
- Personality comes from structured character cards plus tier/model settings, not from hidden prompt chaos. Keep routing and tier assignments explicit in code and docs.
- If GX10 never lands, ship on Plan B and skip the ASUS prize only — the product does not change.

---

## Sponsor And Track Strategy

Sources re-checked April 24, 2026:

- LA Hacks Devpost: https://la-hacks-2026.devpost.com/
- LA Hacks tracks: https://live.lahacks.com/tracks
- Fetch.ai hackpack: https://www.fetch.ai/events/hackathons/la-hacks-2026/hackpack

### Track rules (organizer ruling, 2026-04-24)

- One general track only. Exception: Fetch.ai forces you to pick one too.
- General track XOR Best Overall. Cannot win both.
- Company challenges stack freely with one general track.

### Strategic decision (revised 2026-04-24)

Primary general track: **Flicker to Flow.** Best Overall is dropped (general track XOR Best Overall). Fetch.ai is **optional** — pursue only if the core product is stable with time to spare; the integration is genuinely thin (~100 LOC mailbox sidecar) but not architecturally required.

### Tier A — primary sponsors, shape the product

#### ASUS GX10

Primary hardware target if access is granted at the event. Plan A tiered local inference lives on the GX10 (see API And Model Strategy). Privacy pitch is real: personal future simulation is sensitive, and "your life data never leaves this box" is an honest claim. If GX10 access never lands, ship on Plan B and skip this prize only.

#### ElevenLabs

Voice the future-self interview alongside text streaming. Highest demo impact per hour of build. Non-negotiable.

#### Gemma

Free byproduct of Plan A if GX10 is in play.

### Tier A.5 — the one general track

#### Flicker To Flow

Frame:

> From flicker to flow: AlterEgo converts scattered future anxiety into inspectable turning points and concrete course corrections. The chaos of an unplanned life becomes a navigable timeline of decisions, assumptions, and consequences.

### Optional sponsor — pursue only with spare time

#### Fetch.ai / Agentverse (top prize $2,500)

Build a thin uAgent sidecar (`uagents` Python framework, mailbox mode, ~100 LOC) implementing the Chat Protocol. The sidecar runs alongside the FastAPI backend on the same machine and forwards chat messages to existing REST endpoints. No public endpoint needed — Agentverse acts as the message broker via mailbox. Register on Agentverse. Judges query via ASI:One chat. The agent returns compressed checkpoint previews plus a deep-link to the full web app. Architecturally non-invasive; pursue if the core product is stable.

### Tier B — easy add-ons (nearly free to enter)

- **Figma Make Challenge:** short writeup of how Figma Make was used in the design workflow.
- **MLH Best Domain (GoDaddy):** register a thematic domain (e.g. alterego.life).
- **MLH Best Use of MongoDB Atlas:** our single database for checkpoint ledger, agent state, simulation memory, and native vector search for interview grounding.
- **Cloudinary:** share cards and timeline media. Asset hosting and CDN-side transforms, not inference.

### Tier C — compete passively (special awards, likely stackable)

- Best UI/UX (checkpoint timeline + social feed is genuinely novel)
- Best Social Impact Hack (mental-health agency + misinformation resilience)
- Organizers' Choice (general quality / polish)
- Sponsormaxxing (natural byproduct of 7+ integrations)
- Most Questionable Use of 36 Hours

### Tier D — skip

- Best Overall (excluded by general-track choice)
- Sustain the Spark, Light the Way, Catalyst for Care (only one general track allowed)
- Cognition ($6K, AI coding agents — wrong domain)
- Roblox, World U, Zetic, Arista, MLH Solana, MLH Vultr — wrong shape, wrong form factor, or conflicts with ASUS framing
- Best Hardware Hack (GX10 unlikely to count)
- OmegaClaw Skill Forge

---

## What To Build Next

1. Replace score-first UI language with checkpoint-first language.
2. Render OASIS social feed events in the simulation panel.
3. Create a durable checkpoint ledger type (MongoDB Atlas — checkpoint ledger, agent state, simulation memory, native vector search).
4. Add interrupt/edit/resume state.
5. Make the future-self interview consume the checkpoint ledger.
6. Add source/rationale fields to future events.
7. Add the Agentverse uAgent sidecar only after the core OASIS-first flow is stable, and only if there is time to spare.

---

## What Not To Build First

- full MiroFish integration
- local agent runtime
- complex avatar systems before checkpoint flow works
- score-heavy dashboards
- unrelated sponsor features
- unsupported claims of accuracy

---

## Winning Claim

AlterEgo is an OASIS-powered personal future simulator. It does not ask users to trust a number. It shows the simulated social world, the turning points, the assumptions, and the future self who lived through the branch.
