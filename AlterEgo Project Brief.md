# AlterEgo

**Your future, simulated.**

*LA Hacks 2026 · Project Brief*

---

## What Is It

AlterEgo is a personal future simulation platform. You give it your life — your age, job, habits, goals, fears, personality — and it simulates where that life is heading. Not as a motivational exercise. As an honest, grounded projection of what your current path actually leads to, shaped by both your own patterns and the real events happening in the world around you.

The core experience: upload a selfie, fill in your context, and watch a 3D version of yourself — your face, your avatar — age and change as you drag a timeline forward through the years. At any point, stop and look. See what your simulated self is doing, how they feel, what went right, what went wrong. Interview them. Then come back to the present and change something.

*It is not an oracle. It is a mirror with a long view.*

---

## Why It Matters

Most people drift. They have vague goals, unexamined habits, and no real picture of where those habits compound to over time. They discover too late that the 60-hour work weeks led to burnout, that the delayed savings plan pushed the apartment back by five years, that the job they stayed in out of comfort quietly closed off better paths.

AlterEgo makes the invisible visible — before it is too late to change course.

This is not a wellness app. We are not building something that tells you everything will be fine. The world is hard — economically unstable, politically turbulent, full of disruptions nobody plans for. AlterEgo takes all of that seriously and shows you your future inside it. Honest, slightly uncomfortable, and more useful because of it.

In the longer term, AlterEgo runs in three modes: hosted (we manage inference), bring-your-own-keys (the user plugs in their own LLM credentials), and on-device (full local privacy on capable hardware). For LA Hacks, the demo runs on our infrastructure with optimized models so judges experience the product without setup friction.

---

## How It Works

A discrete-event, OASIS-grounded simulation pipeline. Thirteen steps from a profile to a voiced conversation with the simulated future self.

### Step 1 — Intake (5–10 minutes)

A short guided form captures the structured profile: name, age, nationality, occupation, industry, work pattern, sleep and recovery, financial behavior, short- and long-term goals, self-description, target date, optional hard constraints ("things I would never do"), important people, known life facts. Optionally, journal entries, voice notes, or audio captured through AR glasses.

### Step 2 — Reality Seed

The system pulls real-world context relevant to the profile: live news (GDELT plus curated feeds), country and industry conditions, macro signals — inflation, layoffs, policy shifts, AI disruption, climate. The seed is a structured world snapshot, source-labeled where possible. Not opinion. Not vibes.

### Step 3 — Personalized Agent Graph

The user becomes an agent inside a small social network populated specifically for them: a manager or professional authority, one or two colleagues, a close friend, a family member, industry or media voices, optional misinformation accounts. Each agent gets a character card — values, communication style, biases, relationship to the user — generated from intake.

### Step 4 — Event Planner

The system generates candidate future events for this profile: macro (recessions, layoffs, AI disruption, climate shocks, war), industry (regulation, funding shifts, automation), social (conflict, support, silence, network change), personal (promotion, burnout, relocation, illness, opportunity). Each event carries a title, rationale, time window, uncertainty, expected impact, and source — preserved through the simulation so causal claims stay traceable.

### Step 5 — Checkpoint Scheduler

Discrete-event simulation, not month-by-month brute force. The scheduler picks the next checkpoint based on event salience, user vulnerability, expected impact, uncertainty, and time since the last meaningful checkpoint. Quiet stretches summarize as drift; high-impact periods get full simulation rounds.

### Step 6 — OASIS Simulation Round

At each checkpoint, the chosen event is injected into the social world. Agents post, comment, like, ignore, amplify, misread, support. The user-agent reads the feed and reacts. The full interaction log is recorded — posts, replies, who-influenced-whom, what the user-agent did. This is the lived social evidence for the checkpoint.

### Step 7 — Causal-Hypothesis Extraction

A structured-output LLM call reads the interaction log and produces a checkpoint summary: what happened, who influenced whom, what the simulated self did, which assumptions mattered, what consequences followed, what remains uncertain, what the user can edit. *"Causal"* here means simulated causal hypothesis inside the model world — never real-world proof, never medical or financial certainty.

### Step 8 — Checkpoint Card

The user sees a checkpoint card: time jump ("3 months later…"), triggering event, key social posts, what their simulated self did, consequences, assumptions, and four actions: continue, interrupt, edit, branch.

### Step 9 — Interrupt, Edit, Resume

The user can say *"I would never quit there"* or *"My friend wouldn't react like that"* or *"I would start sleeping more from this point."* Edits become first-class simulation state — they modify agent character cards, the user's own action history, or future event probabilities. The system resumes from the corrected checkpoint, not from scratch.

### Step 10 — Avatar + Timeline

Throughout the simulation, a 3D avatar of the user — built from their selfie via Ready Player Me — ages along the timeline. Face aging via Replicate (SAM model) at multi-year intervals. Outfit, expression, and scene lighting reflect the current life state. Six dimensions shift together from one scrubber gesture.

### Step 11 — Target-Date Completion

When the simulation reaches the chosen horizon, it produces the final snapshot: turning points, assumptions that mattered most, avoidable risks, alternate branches the user could have explored, the timeline of checkpoints, and the social evidence trail.

### Step 12 — Voiced Future-Self Interview

The user opens a chat with their future self. The future self is grounded in the full simulation memory: checkpoint history, social feed, user corrections, branch assumptions, important relationships, final state. Responses arrive in *both voice and text* — voice via ElevenLabs in a warm, tired, honest tone, with the same words streaming as text alongside for accessibility and for the moments the user wants to re-read. The future self knows what was lost, what was kept, what was salvageable.

### Step 13 — One Slider, Re-Simulate

The user changes a single behavior — work hours, savings rate, a relationship choice. The simulation re-runs from the relevant checkpoint forward. Avatar, scores, trajectory shift in real time. The optimistic-path probability moves visibly.

---

## How We Use & Modify OASIS

OASIS (camel-oasis) is the multi-agent social simulation substrate at the core of AlterEgo. Out of the box, it provides agents, social actions (post, comment, like, follow), recommendation/feed dynamics, and interaction logs — designed mostly for batch, report-style scenario simulation. We extend it in five specific ways.

**Personalized agent instantiation.** Instead of generic populations, each user's OASIS instance is seeded with a small, profile-driven graph: their manager, colleagues, a close friend, family, industry voices, optional misinformation accounts. Character cards are generated from intake — values, communication style, biases, relationship to the user — and attached to each agent so behavior stays consistent across the simulation.

**Real-news ingestion.** Vanilla OASIS is driven by synthetic content. We extend the world layer with a real-news pipeline (GDELT plus curated feeds) that filters events relevant to the user's profile and injects them as posts onto the platform. The simulated world is not a sandbox — it reflects what is actually happening.

**Tiered model routing per agent.** A single chat-grade LLM behind every agent is wasteful and produces uniform voices. We route inference by agent tier: the future self and top-relationship agents use the strongest configured model; peers and industry voices use a mid-tier model; noise and misinformation accounts use a small model. The router is backend-agnostic — same interface whether we run hosted APIs or local open-weights on the ASUS GX10.

**Checkpoint orchestration.** Vanilla OASIS runs continuously and produces reports. We restructure around checkpoints: discrete-event scheduling jumps the simulation forward to high-salience moments, runs a full social round there, summarizes drift between, and exposes pause / inspect / edit / resume at every checkpoint.

**Causal-hypothesis extractor.** We add a structured-output pipeline that reads OASIS interaction logs at each checkpoint and produces a causal-hypothesis ledger: who influenced whom, what assumptions were used, what consequences followed, what remains uncertain, what the user can correct. The future-self interview at the end runs against this full ledger, so the simulated future self speaks from inside the actual simulated life — not from a generic prompt.

---

## Tone & Aesthetic

AlterEgo does not celebrate or reassure. It illuminates.

The UI is dark, quiet, and serious. The copy is direct. The avatar's struggling states look like a person managing — not a cartoon of failure — because that is what most people are doing most of the time. The world events are grounded in political reality. The feedback is compassionate but does not soften what is true.

*The feeling we are designing for is not motivation. It is clarity.*

---

## The Five Moments

The demo is designed as a sequence of five distinct moments of genuine surprise, each landing harder because the judges are watching themselves.

**01 — Selfie → 3D Avatar**
Upload a photo. In three seconds, a 3D avatar of you appears, rendered live.

**02 — Drag the Timeline → You Age**
Pull the scrubber forward. Your face ages in real time. Outfit shifts. Scene lighting dims or brightens. Six things change from one gesture.

**03 — Hit the Downside Path**
The avatar looks different. The score reads 41. The system explains the exact causal chain that led here.

**04 — Move One Slider**
Change work hours from 60 to 44. The future updates instantly. The optimistic-path probability doubles.

**05 — Ask Your Future Self**
Type a question. A real, in-character response streams back from the simulated agent living that life — voiced through ElevenLabs in a warm, tired, honest tone, with the same words streaming as text alongside.

---

## Tracks

**Primary — Flicker to Flow**

The track asks: how do we turn the chaos of everyday life into direction and function? That is exactly what AlterEgo does. We turn the friction of an unplanned life into a clear, honest picture of where it leads — and what changing one habit, one decision, one assumption actually does to the trajectory.

**Optional — Fetch.ai · Agentverse Search & Discovery**

If time allows, we register AlterEgo as a discoverable agent on ASI:One via a thin uAgent sidecar (mailbox mode, no public endpoint required). A user could query their future directly through ASI:One Chat and receive a checkpoint preview with a deep-link to the full app. Architecturally non-invasive — the sidecar wraps existing backend endpoints with the Fetch.ai Chat Protocol. Pursued only if the core product is stable with time to spare.

**Sponsor stack (pursued in parallel, no product distortion)**

- ASUS GX10 — local tiered inference, privacy-first demo
- ElevenLabs — voiced future-self interview
- Gemma — present in the local-tier inference plan
- Cloudinary — share cards and timeline media
- MongoDB Atlas — checkpoint ledger
- Figma Make — design workflow
- GoDaddy — domain registration
- Best UI/UX, Best Social Impact, Organizers' Choice — passive entries

---

## Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js 15 + React Three Fiber + Three.js for 3D avatar rendering |
| **Avatar Creation** | Ready Player Me API — selfie → rigged 3D model in 3 seconds |
| **Face Aging** | Replicate API (SAM model) — generates aged face textures at multi-year intervals |
| **Backend** | Python / FastAPI — async, fully typed with Pydantic |
| **LLM Layer** | Tiered agent router. Plan B (default): Claude Opus 4.7 (future self), Claude Sonnet 4.6 (high-signal relationships), Claude Haiku 4.5 (peers and industry voices), Groq llama-3.1-8b (noise accounts). Plan A (if ASUS GX10 access granted): same tiers backed by local open-weight models, selection finalized after hardware test. |
| **World Simulation** | camel-oasis (customized OASIS) — multi-agent social simulation substrate, extended as described above |
| **Voice** | ElevenLabs — voiced future-self interview |
| **Agent Platform (optional)** | uAgents thin sidecar (mailbox mode, ~100 LOC) bridging FastAPI ↔ ASI:One Chat Protocol — only if pursuing the Fetch.ai track |
| **Database** | MongoDB Atlas — checkpoint ledger, agent state, simulation memory, native vector search for future-self interview grounding |
| **Media** | Cloudinary — share cards and timeline media |
| **Deployment** | Vercel (frontend) + Fly.io (backend) + Docker Compose (local) |

---

*AlterEgo · LA Hacks 2026 · Confidential*
