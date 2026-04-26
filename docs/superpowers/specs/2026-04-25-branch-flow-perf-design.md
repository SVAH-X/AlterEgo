# Branch-Flow Performance — Design

**Date:** 2026-04-25
**Branch:** `perf/branch-flow-faster-rewrite`
**Scope:** `POST /simulate/branch` — the pipeline that runs when a user changes one of their timeline events.

## Problem

When the user clicks "rewrite from here →" on a checkpoint card, the wait until the new trajectory lands is too long (observed ~30–60s end-to-end). The slowness is dominated by sequential LLM round-trips that don't all need to be sequential, plus work that can be skipped or reused entirely from the original simulation.

The intervention is conceptually a **branch from the original simulation** — pre-intervention checkpoints are already preserved verbatim — yet today the backend re-derives more than it has to and runs serially what could run in parallel.

This spec proposes the changes needed to bring the wall-clock for `/simulate/branch` from ~30–60s down to ~15–25s, without sacrificing narrative coherence or violating the existing Gemini rate-limit safeguards.

## Assumption — alternate trajectory removal

This design **assumes the alternate (low-hours) trajectory has been removed** from both the backend pipeline and the frontend. That removal is happening in a separate worktree. Concretely, this design assumes:

- `_alternate()` is no longer called in `stream_simulation` or `stream_branched_simulation`.
- The `asyncio.gather(finalize_task, alternate_task)` call site collapses to a single awaited task.
- `SimulationData.checkpointsLow` is either dropped from the model or treated as an empty list.
- `_fan_out_portraits` / `_fan_out_portraits_branched` no longer schedule `low` portraits.

The performance design *integrates* with that change but does not perform it. Where this spec touches code paths affected by the alternate removal, it describes the post-removal shape.

## Goals

1. **Reduce branch wall-clock by 50%+** (target: ≤25s for typical interventions).
2. **Show the first new card sooner** (improve time-to-first-card by ≥3s).
3. **Preserve chronological coherence** in detail-fill — later checkpoints must see earlier ones.
4. **Preserve the existing Gemini concurrency cap** (`PORTRAIT_CONCURRENCY = 3`) — no new rate-limit risk.
5. **Preserve narrative continuity** — the agent cast on a branched run should be the *same* set of agents the user has already met, not freshly re-derived.

## Non-goals

- Parallelizing detail-fill batches (rejected: breaks chronological coherence).
- Speculative early hero-portrait generation using outline-only context (rejected: reduces portrait fidelity).
- Removing the alternate trajectory (handled in another worktree).
- Touching the `/chat` endpoint or any non-branch path beyond what is needed to persist `agents` on first simulation.

## Where the time goes today

| Stage | Today | Mechanism | Sequential? |
|---|---|---|---|
| 1. Counting | ~3–5s | Sonnet call to derive 3–12 `AgentSpec`s | yes |
| 2. Branched planning | ~5–10s | Sonnet call, depends on agents | yes |
| 3. Detail-fill batches | ~5–10s × N | Sonnet call per 4 events, sequential | yes |
| 4. Finalize | ~3–6s | Sonnet call, depends on completed | runs `gather` with alternate |
| 4'. Alternate (today) | ~10–15s | Largest call, `max_tokens=8000` | *(removed in other worktree)* |
| 5. Hero portrait | ~5–10s | Gemini call, runs after detail-fill (and finalize) | yes |
| 6. Portrait fan-out | streaming | Gemini, capped at 3 concurrent | concurrent post-`complete` |

## Design

Five orthogonal changes:

1. **Persist `agents` in `SimulationData`** so branch can skip counting.
2. **Skip counting on branch** — pull `agents` from the inbound `original_simulation`.
3. **Run hero portrait in parallel with `_finalize`** (post-detail-fill, both have full prose context).
4. **Add Anthropic prompt caching** to system prompts on planner / detail / finalize calls.
5. **Strip portraits from the `original_simulation` upload payload** sent by the frontend on `/simulate/branch`.

Each is described below.

### 1. Persist `agents` in `SimulationData`

**Model change:** add a single field to `SimulationData` (and its frontend mirror).

```python
# backend/app/models/simulation.py
class SimulationData(BaseModel):
    profile: Profile
    agents: list[AgentSpec]              # NEW
    agedPortraits: list[AgedPortrait] = []
    checkpointsHigh: list[Checkpoint]
    checkpointsLow: list[Checkpoint] = []  # remains until alternate-removal lands
    futureSelfOpening: str
    futureSelfReplies: dict[str, str]
```

```ts
// frontend/src/types.ts
interface SimulationData {
  profile: Profile;
  agents: AgentSpec[];                   // NEW
  agedPortraits: AgedPortrait[];
  checkpointsHigh: Checkpoint[];
  checkpointsLow: Checkpoint[];
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
}

interface AgentSpec {                    // NEW (mirrors backend)
  agent_id: string;
  role: string;
  name: string;
  relationship: string;
  voice: string;
}
```

**Producer change:** `stream_simulation` populates `agents` when it constructs the `SimulationData` payload right before `yield {"phase": "complete", ...}`. The agents are already available in scope (computed in step 1 of the pipeline) — this is a one-line addition.

**Migration:** No persistence layer to migrate. The frontend is the only place a `SimulationData` lives across requests, and it's stored in React state. Any in-flight session that pre-dates this change will lack `agents`; the branch endpoint must tolerate this (see §2).

### 2. Skip counting on branch

In `stream_branched_simulation`, replace the call to `_count_agents` with a lookup on the inbound `original_simulation`:

```python
# Before:
agents = await _count_agents(profile, router)

# After:
if original_simulation.agents:
    agents = original_simulation.agents
else:
    # Fallback path — pre-change session that didn't persist agents.
    agents = await _count_agents(profile, router)
yield {"phase": "counting", "agents": [a.model_dump() for a in agents]}
```

The `phase: "counting"` event still fires — the frontend's "redrafting the people in your life" copy is part of the regeneration UX and we want to keep it. The phase just resolves instantly when agents are reused.

**Why this matters narratively:** the user has already seen these agents reflected in pre-intervention checkpoints. Re-counting risks producing a slightly different cast (different sibling name, different boss persona) on every branch — subtle continuity break. Reuse fixes that and is also faster.

**Cost saved:** 3–5s per branch.

### 3. Hero portrait runs in parallel with finalize

Today (post-alternate-removal), the tail of `stream_branched_simulation` looks like:

```python
yield {"phase": "finalizing"}
final_payload = await _finalize(profile, agents, completed, router)

hero_portraits = []
if selfie_bytes and settings.gemini_api_key:
    hero = await generate_aged_portrait(..., relevant_events=completed)
    if hero.imageUrl is not None:
        hero_portraits = [hero]

sim = SimulationData(...)
yield {"phase": "complete", "simulation": sim.model_dump()}
```

Change it to:

```python
yield {"phase": "finalizing"}
finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))

hero_task: asyncio.Task[AgedPortrait | None] | None = None
if selfie_bytes and settings.gemini_api_key:
    async def _hero() -> AgedPortrait | None:
        async with portrait_semaphore:                         # see note below
            p = await generate_aged_portrait(
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                profile=profile,
                target_age=ages_b[-1],
                target_year=profile.targetYear,
                trajectory="high",
                relevant_events=completed,                     # FULL prose context
            )
        return p if p.imageUrl is not None else None
    hero_task = asyncio.create_task(_hero())

final_payload = await finalize_task
hero = await hero_task if hero_task else None
hero_portraits = [hero] if hero else []
```

**Why this is safe wrt rate limits:** the hero portrait runs alone in this window. The post-`complete` portrait fan-out hasn't started yet — `complete` is yielded *after* `await hero_task`. So at most one Gemini request is in flight here. Wrapping the hero in the same `PORTRAIT_CONCURRENCY` semaphore that fan-out uses is a defensive belt-and-suspenders measure: if any future change ever causes overlap, the cap is enforced uniformly.

**Why the context quality is preserved:** the hero gets `relevant_events=completed`, which is the full list of detailed checkpoints — identical to today's input. Only the *timing* of the call moves; the prompt input is unchanged.

**Cost saved:** 5–10s per branch (the hero now overlaps with `_finalize` instead of running after it).

**Apply the same change to `stream_simulation`** (the non-branch path) for symmetry — it has the same `finalize → hero` shape.

### 4. Anthropic prompt caching

Add `cache_control: {"type": "ephemeral"}` to the system-prompt blocks on the four LLM calls in the branch pipeline:

- `_plan_branched_outline` (PLANNING_SYSTEM)
- `_detail_batch` (DETAIL_SYSTEM) — repeated on every batch within a single branch
- `_finalize` (FINALIZE_SYSTEM)

The system prompts include the `TONE_BLOCK` (large, identical across calls) and per-phase instructions. With caching, the second and subsequent calls within a single user session pay only for the user-message tokens. Across a branch run with 2–3 detail batches plus planning and finalize, this adds up.

**Implementation:** the caching annotation lives in `backend/app/routing/router.py`'s `complete()` method. Currently the router accepts `system: str`. Change the call sites to pass system as a list of blocks with cache markers, or add a small helper in the router that wraps a system string into a cached block:

```python
# backend/app/routing/router.py — sketch
def _cached_system(text: str) -> list[dict]:
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]
```

The router is shared between branch and non-branch paths, so non-branch `/simulate` benefits too — that's an acceptable side-effect, not a goal.

**Cost saved:** 3–8s aggregate across a branch run, depending on prompt sizes.

**Risk:** Anthropic's ephemeral cache has a 5-minute TTL and a minimum block size. If our system prompts are below the minimum (currently ~1024 tokens), caching becomes a no-op. Validation step in implementation: log the `cache_creation_input_tokens` / `cache_read_input_tokens` counters on a real branch run and confirm reads > 0 by the second call.

### 5. Strip portraits from the `original_simulation` upload

Today, on every intervention, the frontend serializes the full `SimulationData` (including base64-encoded portrait images stored inline in `agedPortraits`) and uploads it as a multipart field to `/simulate/branch`. For a simulation with 9 portraits at ~200KB each base64-encoded, that's ~1.8MB on the wire **per intervention** — and Starlette has to parse it before the LLM pipeline even starts. (We already raised `MAX_PART_BYTES` to 32MB precisely because of this — see `backend/app/api/simulate.py:18`.)

The backend doesn't need the actual image bytes for the branch logic. It only needs the portrait *metadata* (year, trajectory) to decide which preserved high portraits to re-emit during fan-out.

**Frontend change:** `simulateBranchStream` strips `agedPortraits[*].imageUrl` from the payload before serializing:

```ts
// frontend/src/lib/api.ts
const slim: SimulationData = {
  ...originalSimulation,
  agedPortraits: originalSimulation.agedPortraits.map((p) => ({
    ...p,
    imageUrl: "",   // backend only needs (year, trajectory)
  })),
};
form.append("original_simulation", JSON.stringify(slim));
```

**Backend change:** in `_fan_out_portraits_branched`, the `by_year_high` lookup is used to *re-emit* preserved portraits to the frontend during fan-out. With imageUrl stripped, those re-emissions would be empty. But — the frontend already has those portraits in its own state (it's the source of truth that was sent up). So the backend can simply *skip re-emitting preserved portraits* on branch and let the frontend retain its existing ones via a small change in the FE intervention handler:

```ts
// frontend/src/screens/screens-b.tsx — submitIntervention's "complete" handler
} else if (ev.phase === "complete") {
    setSimulation({
        ...ev.simulation,
        agedPortraits: originalSim.agedPortraits.filter(  // KEEP preserved high portraits
            (p) => p.trajectory === "high" && p.year < cp.year
        ),
    });
    // ...
}
```

The backend's `preserved_indices` logic in `_fan_out_portraits_branched` then drops the re-emit-of-preserved branch entirely; only newly-generated portraits are emitted. This is simpler code and faster wire.

**Cost saved:** 1–3s on slower networks; reduces multipart parse time; lowers memory pressure on the backend during form parsing.

### Combined timing — expected outcome

| Stage | Today (post-alternate-removal) | Proposed |
|---|---|---|
| Counting | 3–5s | **0s** (reused) |
| Planning | 5–10s | 4–8s (cached system) |
| Detail-fill (sequential) | 5–10s × N | 4–8s × N (cached system) |
| Finalize ‖ Hero portrait | finalize + hero serial = 8–16s | `max(finalize, hero)` = 5–10s |
| Upload + parse | 1–3s | <0.5s |
| **Total typical** | **~30–60s** | **~15–25s** |

## Components touched

| File | Change |
|---|---|
| `backend/app/models/simulation.py` | Add `agents: list[AgentSpec]` field |
| `backend/app/services/orchestrator.py` | Skip counting on branch; parallelize hero with finalize (both `stream_simulation` and `stream_branched_simulation`); pass `agents` into `SimulationData` constructor |
| `backend/app/routing/router.py` | Add cache-control wrapping for system prompts |
| `backend/app/api/simulate.py` | (No change — already accepts new field via Pydantic) |
| `frontend/src/types.ts` | Add `agents` field to `SimulationData`; add `AgentSpec` type |
| `frontend/src/lib/api.ts` | Strip `imageUrl` from `original_simulation.agedPortraits` before upload on `simulateBranchStream` |
| `frontend/src/screens/screens-b.tsx` | On `phase: complete` in `submitIntervention`, re-attach preserved high portraits from `originalSim` (since backend no longer re-emits them) |
| `frontend/src/data.ts` | Add `agents: []` to `AE_DATA` fallback so the dev-mode fallback still type-checks |

## Data flow — branch request, post-change

```
User clicks "rewrite from here →"
  │
  ▼
FE: submitIntervention(idx, text)
  │  · slims original_simulation (drops portrait imageUrl)
  │  · POST /simulate/branch (multipart)
  ▼
BE: stream_branched_simulation
  │
  │  agents = original.agents       ← reused (no LLM)
  │  yield {phase: counting}
  │
  │  outline = await _plan_branched_outline(...)    [cached system]
  │  yield {phase: plan}
  │
  │  for cp in kept:
  │    yield {phase: event, index: i, checkpoint: cp}   ← preserved verbatim
  │
  │  for batch in detail_batches:                   [cached system, sequential]
  │    cps = await _detail_batch(...)
  │    for cp in cps:
  │      yield {phase: event, index: ..., checkpoint: cp}
  │
  │  yield {phase: finalizing}
  │  finalize_task = create_task(_finalize(...))    [cached system]
  │  hero_task     = create_task(_hero())           ← runs in parallel
  │  final_payload = await finalize_task
  │  hero          = await hero_task
  │
  │  yield {phase: complete, simulation: sim_with_hero}
  │
  └─ post-complete portrait fan-out (unchanged, capped at PORTRAIT_CONCURRENCY)
```

## Error handling

- **Missing `agents` on inbound `original_simulation`:** fall back to `_count_agents()` as today. Log a warning so we can see if pre-change sessions are still in the wild.
- **Hero portrait fails (Gemini error):** existing behavior — `generate_aged_portrait` returns an `AgedPortrait` with `imageUrl=None`; we treat that as "no hero" and emit `complete` without one. The post-`complete` fan-out will still attempt the other anchors.
- **Finalize fails:** raises `OrchestrationError`, caught at the top level, emitted as `phase: error`. Hero task is cancelled in the `except` path to avoid leaking the Gemini call.
- **Cache miss / cache disabled:** `cache_control` annotations are advisory; if Anthropic doesn't honor them (e.g., block too small), calls just fall through to non-cached pricing/latency. No correctness impact.

## Testing strategy

1. **Unit:** `SimulationData` round-trips with `agents` field. `AgentSpec` Pydantic validation unchanged.
2. **Backend integration:** `stream_branched_simulation` with a hand-built `original_simulation` containing populated `agents` does not call `_count_agents` (mock the router and assert). Hero portrait task is created before `await finalize_task` (assert via timing or mock-call ordering).
3. **Backend integration — fallback:** branch with `agents=[]` falls back to `_count_agents`.
4. **Frontend type-check:** `npm run typecheck` clean after type changes.
5. **End-to-end smoke (manual):** run a simulation, intervene, observe wall-clock for `phase: complete`. Compare against pre-change baseline. Confirm portrait fidelity is unchanged (still uses full `completed` for relevance).
6. **Cache validation:** instrument `router.complete` to log `cache_read_input_tokens` from Anthropic responses. On a branch run with 2+ detail batches, the second batch's response should report nonzero cache reads.

## Rollout & risk

- **Risk:** the `agents` field addition is a non-breaking schema change for existing in-flight sessions because the FE sends whatever it has. Defaulting to `[]` and falling back to count-on-empty makes this safe.
- **Risk:** prompt caching is opt-in; if Anthropic's pricing or behavior changes, we can flip a router-level flag off without code surgery.
- **Risk:** the FE's preserved-portrait re-attach is a new code path. Test by intervening on a year that does and does not have a corresponding pre-existing portrait anchor.

No feature flag required — these changes are mechanically scoped to the branch path (and a tiny additive change to `stream_simulation`'s portrait timing). If any individual change regresses, it can be reverted in isolation.
