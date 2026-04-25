# AlterEgo — Strategy

Last updated: April 24, 2026

This document tracks the competitive strategy. The product reality is in `CLAUDE.md`.

## Product thesis

Most people drift — vague goals, unexamined habits, no real picture of where those compound to. AlterEgo makes the invisible visible: a precomputed twenty-year simulation in two paths (your current trajectory and an alternate), with a voiced future self you can talk to.

The differentiator is not the technology. It is the demo's emotional precision: the user sees themselves aged, hears a tired honest version of themselves speak first, then watches one slider redraw their future. Three minutes. Zero spinners.

## Architecture (current, MVP)

```
Browser ──► Vite/React frontend ──► FastAPI backend ──┬──► Anthropic API
                                                       └──► ElevenLabs
```

Stateless backend. Frontend holds the simulation result and passes chat history per call.

Two backend endpoints carry the product:

- `POST /simulate` — one big Claude call: profile → SimulationData (both paths, opening line, canned replies)
- `POST /chat` (+ `/chat/voice`) — chat replies in future-self voice

Everything else (OASIS, multi-agent, MongoDB, GDELT, Replicate aging, RPM, Three.js) is layered enhancement, not MVP.

## Demo discipline

Pre-bake everything. Live API calls during the 3-minute pitch are how good projects lose.

- Three sample profiles end-to-end: Sarah (the canonical one in `data.ts`), and two alternates.
- Aged portraits, opening voice lines, full SimulationData all cached as static assets per sample.
- Live judge interaction happens on the **encore** screen — their own selfie, their own intake, their own voice line. Run that pipeline in parallel during the scripted Sarah demo so it's ready by the time you say "want to see yours?"
- Never let a judge stare at a spinner.

## Track strategy (organizer ruling, 2026-04-24)

- One general track only. Exception: Fetch.ai forces a general-track pick too.
- General track XOR Best Overall.
- Company challenges stack freely.

### Decision

- **Primary general track:** Flicker to Flow.
- **Best Overall:** dropped (excluded by general-track choice).
- **Fetch.ai:** optional. Pursue only if the core demo is rock-solid with hours to spare.

### Tier A — primary sponsors, shape the product

- **ElevenLabs** — voiced future-self interview (text + voice). Highest demo impact per hour. Non-negotiable.
- **ASUS GX10** — if access is granted at the event, run inference locally. Privacy pitch ("your life data never leaves this box") is honest. If access doesn't land, ship on hosted APIs and skip this prize only.
- **Gemma** — free byproduct of Plan A if GX10 is in play.

### Tier A.5 — the one general track

**Flicker to Flow.** Frame:

> AlterEgo turns the friction of an unplanned life into a clear, honest picture of where it leads — and what changing one habit, decision, or assumption actually does to the trajectory.

### Optional sponsor — pursue only with spare time

**Fetch.ai Agentverse.** Thin uAgent sidecar (`uagents` Python framework, mailbox mode, ~100 LOC) implementing the Chat Protocol. The sidecar runs alongside FastAPI on the same machine and forwards chat messages to existing REST endpoints. No public endpoint needed — Agentverse acts as the message broker via mailbox. Top prize $2,500. Architecturally non-invasive.

### Tier B — easy add-ons (nearly free to enter)

- **Figma Make Challenge** — short writeup of how Figma Make was used in the design workflow.
- **MLH Best Domain (GoDaddy)** — register a thematic domain (e.g. alterego.life).
- **Cloudinary** — share cards (a still image of "you at 52, two ways"); side benefit: hosts user-uploaded selfies and any aged portraits we cache.

### Tier C — compete passively (special awards, likely stackable)

- Best UI/UX (the demo lives here)
- Best Social Impact Hack (mental-health agency framing)
- Organizers' Choice (general quality / polish)
- Sponsormaxxing (natural byproduct)
- Most Questionable Use of 36 Hours

### Tier D — skip

- Best Overall (excluded)
- Sustain the Spark, Light the Way, Catalyst for Care (only one general track)
- Cognition ($6K, AI coding agents — wrong domain)
- Roblox, World U, Zetic, Arista, MLH Solana, MLH Vultr, Best Hardware Hack
- OmegaClaw Skill Forge
- MLH Best Use of MongoDB Atlas (no Mongo in MVP — re-add only if persistence becomes necessary)

## Inference

- **Plan B (default):** `claude-opus-4-7` for the simulation call (one per session, quality matters); `claude-sonnet-4-6` for chat replies (cheaper, faster turns); ElevenLabs for voice.
- **Plan A (GX10 only):** same router interface, local open-weights served via vLLM/Ollama. Specific models deferred until hardware bringup.

The router is backend-agnostic. Plan A vs B is a config flag.

## What to build, in order

1. **MVP backend** — `/simulate` (one Claude call → SimulationData JSON) + `/chat` + `/chat/voice`. No persistence, no multi-step pipeline.
2. **Frontend ↔ backend wiring** — replace `AE_DATA` hardcoded sample with a real call to `/simulate` after intake.
3. **Pre-bake three sample profiles** — Sarah plus two alternates. Cache responses so live demo never hits the API on the scripted path.
4. **Replicate face aging** — replace picsum placeholders with real aged photos. Precompute during processing screen.
5. **Polish the chat voice line cadence** — generate 10 opening-voice variants per sample, pick the best, cache the audio.
6. **Backup video** — record a flawless run of the full demo. Play if wifi dies.

Stop after step 6 unless every previous piece is unbreakable. Anything past this — multi-agent, OASIS, RPM 3D — is for the post-hackathon roadmap.

## What's deferred (post-hackathon roadmap)

- Multi-agent counting orchestrator + 1–20 typed agents (user, family, friend, boss, coworker, …)
- Visible inter-agent dialogue in checkpoint cards
- OASIS as the simulation substrate
- Real-news ingestion (GDELT)
- MongoDB Atlas for persistence + vector search for grounded interview
- Ready Player Me 3D avatar via Three.js
- Discrete-event scheduler with interrupt/edit/resume
- Causal-hypothesis extractor

These were in earlier briefs. They are real product directions worth pursuing — just not in 48 hours.
