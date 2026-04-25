# AlterEgo Build Summary

Last updated: April 24, 2026

## Status Note

This idea is still basic and can be optimized significantly. The current plan is the working foundation, not the final form. Architecture, simulation quality, checkpoint logic, agent behavior, UI, and evaluation methods should all be expected to evolve.

---

## Project Goal

AlterEgo is a personal future simulator.

It is not meant to be a simple score predictor. The product thesis is that a person's future is shaped by the information environment they live inside:

- social media
- news and misinformation
- workplace signals
- industry shifts
- personal support or silence
- repeated small reactions over time

The system should simulate how those forces shape a possible future, let the user inspect the turning points, and allow them to interrupt and correct unrealistic assumptions.

At the end of the simulation, the user should be able to talk with their future self, grounded in the simulated history.

---

## Core Direction

The active direction is OASIS-first.

The old simple-function / score-prediction demo is now legacy. It is archived under:

- `legacy/simple-function/`

The old approach may still be useful for fallback, calibration, and reference, but it is not the main product direction.

---

## Main Idea

Instead of saying:

> "Your wellbeing in 5 years is 0.61"

AlterEgo should show:

- what happened in the simulated world
- who influenced the user
- what the simulated user did
- which assumptions mattered
- what changed the branch
- where the user can interrupt and correct the simulation

Internal state values may still exist for charting, branch tracking, and resume logic, but the public product should focus on checkpoints, social evidence, and turning points rather than raw scores.

---

## Product Flow

### 1. Intake

Collect user profile and simulation setup:

- name
- age
- nationality / current country
- occupation
- industry
- work pattern
- sleep / recovery pattern
- financial behavior
- short-term goal
- long-term goal
- self-description
- target date
- optional hard constraints such as "things I would never do"

### 2. Reality Seed

Build initial world context from:

- current news
- country context
- industry context
- user goals
- user vulnerabilities
- relevant information-environment signals

Possible data sources:

- GDELT
- RSS or news APIs
- curated scenario libraries
- LLM synthesis

### 3. Agent Graph

Build a social graph around the user with OASIS.

Typical agents:

- user / protagonist
- manager or professional authority
- colleague or peer
- close friend
- family member
- industry/media voices
- optional noise or misinformation accounts

Agents run behind a backend-agnostic tiered router with two interchangeable backends:

- **Plan B (default for the hackathon):** hosted APIs mapped tier-for-tier. Claude Opus 4.7 (future self), Sonnet 4.6 (high-signal), Haiku 4.5 (peers and industry), Groq llama-3.1-8b (noise).
- **Plan A (only if ASUS GX10 access is granted):** local open-weights on the GX10, same tier mapping. Specific model selection deferred until hardware bringup; candidates from the Llama / Qwen / Gemma open-weight families.

The router swaps via config; simulation, agent cards, and UI do not depend on backend choice. We build on Plan B and swap to Plan A only if the hardware lands.

### 4. Event Planner

Generate candidate future events, such as:

- layoffs
- promotions
- burnout periods
- policy changes
- industry disruption
- financial shocks
- social conflicts
- health scares
- opportunities
- relocation pressure

Each event should include:

- title
- description
- rationale or source
- estimated time window
- affected people / domains
- uncertainty
- assumptions

### 5. Checkpoint Scheduler

Do not brute-force every month with full simulation.

Use checkpoint-based simulation:

- important events get full OASIS rounds
- quiet periods become summarized drift
- periodic check-ins still happen so the user can intervene

A checkpoint should be selected based on:

- salience
- likely impact
- uncertainty
- relevance to the user's profile
- time since last meaningful checkpoint
- internal state thresholds

### 6. OASIS Simulation Round

At each checkpoint:

1. inject an event into the social world
2. let agents post, react, ignore, support, misread, or amplify
3. collect interaction history and social feed
4. let the simulated user react
5. preserve enough state to resume later

### 7. Causal-Hypothesis Extraction

Read the OASIS interaction log and produce a structured checkpoint summary:

- what happened
- who influenced whom
- what the simulated self did
- what assumptions were used
- what consequences followed
- what is still uncertain
- what the user can edit

Important constraint:

"Causal" here means simulated causal hypothesis inside the model world, not scientific proof of real-world causality.

### 8. Checkpoint UI

The user should see progress during long simulations.

Each checkpoint card can show:

- time jump
- triggering event
- key social posts
- what the simulated self did
- consequences
- assumptions
- actions: continue / interrupt / edit / branch

### 9. Interrupt / Edit / Resume

This is one of the key product features.

If the simulated user does something unrealistic, the real user should be able to say things like:

- "I would never do that."
- "My friend would not react like that."
- "I would change jobs earlier."
- "I would start sleeping more after this point."

Then AlterEgo should resume from that checkpoint rather than fully restarting whenever possible.

### 10. Target-Date Completion

When the simulation reaches the requested target date, return:

- future snapshot
- turning points
- assumptions that mattered most
- avoidable risks
- alternate branch suggestions
- checkpoint timeline
- social evidence trail

### 11. Future-Self Interview

After target-date completion, the user should be able to talk with their future self.

That future self should be grounded in:

- checkpoint history
- social feed history
- user corrections
- branch assumptions
- important relationships
- final simulated state

If direct OASIS interview is unavailable, fallback to a hosted LLM prompt that includes the same memory and simulation record.

---

## Technical Direction

### Backend

The backend should be rebuilt around:

- OASIS-based simulation
- event planning
- checkpoint scheduling
- simulation memory
- interrupt/edit/resume support
- future-self interview support
- hosted model API routing for different agent types

### Frontend

The frontend should be rebuilt around:

- intake flow
- checkpoint timeline
- social feed visualization
- checkpoint cards
- edit/resume controls
- target-date result view
- future-self interview chat

### Legacy Code

The old backend, frontend, and demo logic may remain as archived reference under `legacy/simple-function/`.

Useful legacy concepts:

- fallback predictions
- calibration ideas
- simple progress flow
- old API patterns

But the new build should not be constrained by the old score-first demo structure.

---

## Architecture Summary

```text
User intake
  -> reality seed
  -> personalized agent graph
  -> future event planner
  -> checkpoint scheduler
  -> OASIS simulation rounds
  -> causal-hypothesis extractor
  -> checkpoint UI
  -> user interrupt/edit/resume
  -> target-date result
  -> future-self interview
```

---

## Important Constraints

### 1. Do not overclaim

The project should not claim:

- guaranteed future prediction
- scientific causal proof
- medical certainty
- financial certainty

### 2. Keep assumptions visible

Users should be able to inspect the assumptions that shaped their simulated branch.

### 3. Keep the user in control

Interrupting, editing, and resuming should be part of the core experience, not an afterthought.

### 4. Keep the future-self interview

This is a required feature, not optional decoration.

### 5. Keep the architecture flexible

Because this idea is still basic and can be optimized, the system should be designed so that:

- checkpoint logic can change
- event generation can improve
- model routing can improve
- simulation memory can improve
- evaluation methods can improve
- UI can evolve without rewriting the entire backend

---

## Build Priorities

Suggested order:

1. define new repo structure
2. rebuild backend API skeleton
3. rebuild frontend skeleton
4. implement intake and target-date setup
5. implement OASIS agent graph creation
6. implement event planning and checkpoint scheduling
7. implement checkpoint simulation and social feed extraction
8. implement checkpoint UI
9. implement interrupt/edit/resume
10. implement target-date snapshot
11. implement future-self interview
12. add sponsor/track integrations only after the core loop is coherent

---

## Track And Prize Framing

Track rules (organizer ruling, 2026-04-24): one general track only, except Fetch.ai which requires picking a general track too; general track XOR Best Overall; company challenges stack freely.

Decision (revised 2026-04-24): primary general track = **Flicker to Flow**. Fetch.ai is **optional** (pursue only if core product stable with time to spare; ~100 LOC mailbox sidecar). Best Overall is dropped.

**Tier A — shape the product:** ASUS GX10, ElevenLabs, Gemma.
**Tier A.5 — the one general track:** Flicker to Flow.
**Optional sponsor:** Fetch.ai Agentverse ($2,500 top — thin uAgent sidecar, mailbox mode).
**Tier B — easy add-ons:** Figma Make, GoDaddy (MLH Best Domain), MongoDB Atlas (MLH), Cloudinary.
**Tier C — compete passively:** Best UI/UX, Best Social Impact, Organizers' Choice, Sponsormaxxing, Most Questionable.
**Tier D — skip:** Best Overall, the other three general tracks, Cognition, Roblox, World U, Zetic, Arista, Solana, Vultr, Best Hardware Hack, OmegaClaw.

Integrations should support the core product. Do not add features (sustainability, education, etc.) purely to qualify for additional tracks — focused excellence beats theme-coverage.

See `CHAMPION_STRATEGY.md` for per-prize framing.

---

## Final Summary

AlterEgo is being rebuilt as an OASIS-powered personal future simulator.

The product will:

- simulate a user's future through social and information dynamics
- show important checkpoints instead of only scores
- let the user interrupt and correct unrealistic assumptions
- continue the simulation from edited checkpoints
- and let the user talk with their future self at the target date

This plan is the current foundation only. The idea is still basic and should be expected to improve and change as the project becomes more mature.
