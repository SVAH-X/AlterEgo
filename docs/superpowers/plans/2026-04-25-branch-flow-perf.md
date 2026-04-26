# Branch-Flow Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `POST /simulate/branch` wall-clock from ~30–60s to ~15–25s by skipping work that can be reused (counting), parallelizing what can run together (hero portrait + finalize), caching what's repeated (system prompts), and slimming the upload payload.

**Architecture:** Five orthogonal changes against the existing `stream_branched_simulation` pipeline in `backend/app/services/orchestrator.py`, plus a tiny additive change to `stream_simulation` (so the `agents` round-trip is populated) and three small frontend edits (type field, upload slimming, post-`complete` portrait reattach). Each task is independently revertible.

**Tech Stack:** FastAPI + Pydantic + `anthropic` AsyncSDK on the backend (pytest + pytest-asyncio for tests). React 18 + TypeScript on the frontend.

**Spec reference:** `docs/superpowers/specs/2026-04-25-branch-flow-perf-design.md`

**Worktree:** `/Users/bensonlee/Projects/AlterEgo/.worktrees/perf-branch-flow`, branch `perf/branch-flow-faster-rewrite`.

**Pre-flight (run once before Task 1):**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/perf-branch-flow
./scripts/setup.sh                       # creates backend/.venv
cd frontend && npm install && cd ..
cd backend && source .venv/bin/activate && pytest -x && cd ..
cd frontend && npm run typecheck && cd ..
```

Expected: backend tests pass, frontend typecheck passes. If anything fails, stop and report — that's the pre-existing baseline.

---

## Task 1: Add `agents` field to `SimulationData` (schema only)

**Goal:** Both the Pydantic model (backend) and the TypeScript interface (frontend) gain an `agents` field. Default `[]` so existing callers keep working.

**Files:**
- Modify: `backend/app/models/simulation.py`
- Modify: `frontend/src/types.ts:32-39` (the `SimulationData` interface)
- Modify: `frontend/src/data.ts` (add `agents: []` to `AE_DATA` so the dev-mode fallback type-checks)
- Test: `backend/tests/test_simulation_model.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_simulation_model.py`:

```python
from app.models import SimulationData
from app.models.orchestration import AgentSpec
from app.models.profile import Profile


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def test_simulation_data_round_trips_with_agents() -> None:
    agent = AgentSpec(
        agent_id="manager", role="manager", name="Dana",
        relationship="line manager who shaped your early career",
        voice="clipped, transactional",
    )
    sim = SimulationData(
        profile=_profile(),
        agents=[agent],
        agedPortraits=[],
        checkpointsHigh=[],
        checkpointsLow=[],
        futureSelfOpening="hi",
        futureSelfReplies={"q": "a"},
    )
    raw = sim.model_dump_json()
    restored = SimulationData.model_validate_json(raw)
    assert restored.agents == [agent]


def test_simulation_data_defaults_agents_to_empty_list() -> None:
    sim = SimulationData(
        profile=_profile(),
        agedPortraits=[],
        checkpointsHigh=[],
        checkpointsLow=[],
        futureSelfOpening="hi",
        futureSelfReplies={"q": "a"},
    )
    assert sim.agents == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_simulation_model.py -v
```

Expected: both tests FAIL with a Pydantic `ValidationError` ("missing field 'agents'") OR `AttributeError` on `restored.agents`.

- [ ] **Step 3: Add the field to `SimulationData`**

Edit `backend/app/models/simulation.py` to:

```python
from pydantic import BaseModel, Field

from app.models.checkpoint import Checkpoint
from app.models.orchestration import AgentSpec
from app.models.portrait import AgedPortrait
from app.models.profile import Profile


class SimulationData(BaseModel):
    """Mirrors frontend `src/types.ts` SimulationData exactly.

    The single object returned by POST /simulate. The frontend stores it and
    drives all eight screens from this payload.
    """

    profile: Profile
    agents: list[AgentSpec] = Field(default_factory=list)   # cast of agents in the user's life
    agedPortraits: list[AgedPortrait]            # 10 entries: 5 high + 5 low
    checkpointsHigh: list[Checkpoint]            # current-trajectory path (6 cards)
    checkpointsLow: list[Checkpoint]             # alternate-hours path (6 cards)
    futureSelfOpening: str                       # 25–50 word voiced reveal line
    futureSelfReplies: dict[str, str]            # 3 canned Q→A pairs
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_simulation_model.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Update the frontend interface**

Edit `frontend/src/types.ts` so the `SimulationData` interface (lines 32–39) becomes:

```ts
export interface SimulationData {
  profile: Profile;
  agents: AgentSpec[];
  agedPortraits: AgedPortrait[];
  checkpointsHigh: Checkpoint[];
  checkpointsLow: Checkpoint[];
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
}
```

(The `AgentSpec` type is already exported from this file at lines 43–49 — no need to add it.)

- [ ] **Step 6: Update the AE_DATA fallback**

Edit `frontend/src/data.ts`. After the `profile` object (around line 14, before `agedPortraits:`), add:

```ts
  agents: [],
```

- [ ] **Step 7: Verify frontend type-checks**

```bash
cd frontend && npm run typecheck
```

Expected: `Found 0 errors` (or whatever the project's clean-pass output is). If errors surface, they will name the file/line — fix only those, don't refactor.

- [ ] **Step 8: Run the existing backend test suite to confirm no regression**

```bash
cd backend && source .venv/bin/activate && pytest -x
```

Expected: all pre-existing tests still pass (the new field has a default, so existing call sites that construct `SimulationData` without it still work).

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/simulation.py backend/tests/test_simulation_model.py \
        frontend/src/types.ts frontend/src/data.ts
git commit -m "feat: add agents field to SimulationData

Persist the agent cast on the simulation payload so the branch endpoint
can reuse it instead of re-deriving via _count_agents on every
intervention.

Defaults to [] for backward-compat with any in-flight session.
"
```

---

## Task 2: Populate `agents` in `stream_simulation`'s output

**Goal:** When the non-branch `/simulate` pipeline finishes, the `SimulationData` it yields includes the agent list it just computed in step 1 of the pipeline. This is what makes Task 3's reuse possible.

**Files:**
- Modify: `backend/app/services/orchestrator.py:116-123` (the `SimulationData(...)` constructor in `stream_simulation`)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_orchestrator_agents_persisted.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from app.models import Profile
from app.models.orchestration import AgentSpec, OutlineEvent
from app.models import Checkpoint


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


_AGENTS = [
    AgentSpec(agent_id="user", role="user", name="Sam",
              relationship="protagonist", voice="tired, honest"),
    AgentSpec(agent_id="manager", role="manager", name="Dana",
              relationship="line manager", voice="clipped"),
]


@pytest.mark.asyncio
async def test_stream_simulation_persists_agents_on_complete(monkeypatch) -> None:
    """The simulation payload yielded with phase=='complete' must include the
    agents list so /simulate/branch can reuse it."""
    from app.services import orchestrator as orch

    async def fake_count(profile, router):
        return list(_AGENTS)

    async def fake_plan(profile, agents, router, intervention=None):
        return [OutlineEvent(year=2028, severity=0.5, primary_actors=["user"],
                             visibility=["user"], hint="h")]

    async def fake_detail(profile, agents, full_outline, completed, batch, router):
        return [Checkpoint(year=2028, age=34, title="t", event="e",
                           did="d", consequence="c", tone="neutral")
                for _ in batch]

    async def fake_finalize(profile, agents, checkpoints, router):
        return {
            "futureSelfOpening": "hi",
            "futureSelfReplies": {
                "What did I get wrong?": "a",
                "Am I happy?": "b",
                "What should I change?": "c",
            },
        }

    async def fake_alternate(profile, checkpoints, router):
        return [Checkpoint(year=2028, age=34, title="t", event="e",
                           did="d", consequence="c", tone="neutral")]

    monkeypatch.setattr(orch, "_count_agents", fake_count)
    monkeypatch.setattr(orch, "_plan_outline", fake_plan)
    monkeypatch.setattr(orch, "_detail_batch", fake_detail)
    monkeypatch.setattr(orch, "_finalize", fake_finalize)
    monkeypatch.setattr(orch, "_alternate", fake_alternate)
    # No selfie so the hero portrait path is skipped.

    events = []
    async for ev in orch.stream_simulation(_profile(), selfie_bytes=None):
        events.append(ev)
        if ev["phase"] == "complete":
            break

    completes = [e for e in events if e["phase"] == "complete"]
    assert len(completes) == 1
    sim = completes[0]["simulation"]
    assert sim["agents"] == [a.model_dump() for a in _AGENTS]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_agents_persisted.py -v
```

Expected: FAIL with `assert [] == [{...}, {...}]` — the field defaults to empty because `stream_simulation` doesn't pass agents into the constructor yet.

- [ ] **Step 3: Modify `stream_simulation` to pass `agents`**

In `backend/app/services/orchestrator.py`, find the `SimulationData(...)` construction inside `stream_simulation` (around line 116). Change it from:

```python
        sim = SimulationData(
            profile=profile,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

to:

```python
        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_agents_persisted.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/orchestrator.py backend/tests/test_orchestrator_agents_persisted.py
git commit -m "feat: persist agents in stream_simulation output

The non-branch pipeline now writes the cast it generated into
SimulationData.agents, so the frontend can replay it back to
/simulate/branch and skip re-counting on every intervention.
"
```

---

## Task 3: Skip counting on branch when `agents` are present

**Goal:** `stream_branched_simulation` reuses `original_simulation.agents` when populated, falling back to `_count_agents` only when the inbound list is empty (pre-change session).

**Files:**
- Modify: `backend/app/services/orchestrator.py:251-254` (the `_count_agents` call in `stream_branched_simulation`)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_orchestrator_branch_skips_counting.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from app.models import Checkpoint, Profile, SimulationData
from app.models.orchestration import AgentSpec, OutlineEvent


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


_AGENTS = [
    AgentSpec(agent_id="user", role="user", name="Sam",
              relationship="protagonist", voice="tired, honest"),
    AgentSpec(agent_id="manager", role="manager", name="Dana",
              relationship="line manager", voice="clipped"),
]


def _kept_cps() -> list[Checkpoint]:
    return [
        Checkpoint(year=2028, age=34, title="t1", event="e", did="d",
                   consequence="c", tone="neutral"),
        Checkpoint(year=2032, age=38, title="t2", event="e", did="d",
                   consequence="c", tone="neutral"),
    ]


def _original_sim(agents: list[AgentSpec]) -> SimulationData:
    return SimulationData(
        profile=_profile(),
        agents=agents,
        agedPortraits=[],
        checkpointsHigh=_kept_cps(),
        checkpointsLow=[],
        futureSelfOpening="hi",
        futureSelfReplies={"q": "a"},
    )


@pytest.fixture
def patched_pipeline(monkeypatch):
    """Patch every step except counting so we can observe whether counting fires."""
    from app.services import orchestrator as orch

    async def fake_plan(profile, agents, kept, intervention, router):
        return [OutlineEvent(year=2038, severity=0.5, primary_actors=["user"],
                             visibility=["user"], hint="h")]

    async def fake_detail(profile, agents, full_outline, completed, batch, router):
        return [Checkpoint(year=2038, age=44, title="new", event="e",
                           did="d", consequence="c", tone="neutral")
                for _ in batch]

    async def fake_finalize(profile, agents, checkpoints, router):
        return {
            "futureSelfOpening": "hi",
            "futureSelfReplies": {
                "What did I get wrong?": "a",
                "Am I happy?": "b",
                "What should I change?": "c",
            },
        }

    async def fake_alternate(profile, checkpoints, router):
        return [Checkpoint(year=2038, age=44, title="alt", event="e",
                           did="d", consequence="c", tone="neutral")]

    monkeypatch.setattr(orch, "_plan_branched_outline", fake_plan)
    monkeypatch.setattr(orch, "_detail_batch", fake_detail)
    monkeypatch.setattr(orch, "_finalize", fake_finalize)
    monkeypatch.setattr(orch, "_alternate", fake_alternate)
    return orch


@pytest.mark.asyncio
async def test_branch_skips_counting_when_agents_present(patched_pipeline) -> None:
    orch = patched_pipeline
    count_mock = AsyncMock(return_value=list(_AGENTS))
    with patch.object(orch, "_count_agents", count_mock):
        events = []
        async for ev in orch.stream_branched_simulation(
            profile=_profile(),
            intervention={"year": 2036, "text": "I quit"},
            original_simulation=_original_sim(_AGENTS),
            selfie_bytes=None,
        ):
            events.append(ev)
            if ev["phase"] == "complete":
                break

    count_mock.assert_not_awaited()
    counting_events = [e for e in events if e["phase"] == "counting"]
    assert len(counting_events) == 1
    assert counting_events[0]["agents"] == [a.model_dump() for a in _AGENTS]


@pytest.mark.asyncio
async def test_branch_falls_back_to_counting_when_agents_empty(patched_pipeline) -> None:
    orch = patched_pipeline
    count_mock = AsyncMock(return_value=list(_AGENTS))
    with patch.object(orch, "_count_agents", count_mock):
        events = []
        async for ev in orch.stream_branched_simulation(
            profile=_profile(),
            intervention={"year": 2036, "text": "I quit"},
            original_simulation=_original_sim(agents=[]),    # empty
            selfie_bytes=None,
        ):
            events.append(ev)
            if ev["phase"] == "complete":
                break

    count_mock.assert_awaited_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_branch_skips_counting.py -v
```

Expected: `test_branch_skips_counting_when_agents_present` FAILS — `_count_agents` is awaited because the current code unconditionally calls it.

- [ ] **Step 3: Replace the unconditional `_count_agents` call**

In `backend/app/services/orchestrator.py`, find inside `stream_branched_simulation` (around line 251–254):

```python
        # 1. Re-derive agents (we don't persist them in SimulationData).
        agents = await _count_agents(profile, router)
        yield {"phase": "counting", "agents": [a.model_dump() for a in agents]}
```

Replace with:

```python
        # 1. Reuse the cast from the original simulation if present; only
        # fall back to a fresh count for pre-change sessions that didn't
        # persist agents (defensive — costs an LLM call when it triggers).
        if original_simulation.agents:
            agents = list(original_simulation.agents)
        else:
            agents = await _count_agents(profile, router)
        yield {"phase": "counting", "agents": [a.model_dump() for a in agents]}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_branch_skips_counting.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Run the full backend test suite to confirm no regression**

```bash
cd backend && source .venv/bin/activate && pytest -x
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/orchestrator.py \
        backend/tests/test_orchestrator_branch_skips_counting.py
git commit -m "perf: reuse agents from original simulation on branch

Skips the ~3-5s counting LLM call when the inbound original_simulation
already carries an agents list (which it does after the previous
commit). Falls back to _count_agents when the list is empty so any
pre-change session in flight still works.

Also stabilizes narrative continuity — the user sees the same cast
(same names, same voices) on a branched run instead of a fresh draw.
"
```

---

## Task 4: Run hero portrait in parallel with `_finalize`

**Goal:** In both `stream_simulation` and `stream_branched_simulation`, the hero portrait fires as an `asyncio.Task` *concurrent with* `_finalize` instead of after it. Both have full `completed` checkpoints as context (no fidelity loss). Wrapped in the existing `PORTRAIT_CONCURRENCY` semaphore for defense-in-depth.

This task assumes the alternate trajectory removal is happening separately. The current code has `asyncio.gather(finalize_task, alternate_task)` — when alternate-removal lands, that becomes just `await finalize_task`. This task adds `hero_task` to the parallel set regardless of whether alternate is still there. After alternate-removal merges, the gather collapses to `(finalize_task, hero_task)`.

**Files:**
- Modify: `backend/app/services/orchestrator.py:91-115` (tail of `stream_simulation`)
- Modify: `backend/app/services/orchestrator.py:290-321` (tail of `stream_branched_simulation`)
- Test: `backend/tests/test_orchestrator_parallel_hero.py` (new)

- [ ] **Step 1: Hoist the portrait semaphore to module scope**

The current `PORTRAIT_CONCURRENCY = 3` lives at module scope (line 502 of orchestrator.py). The `Semaphore` itself is currently created *inside* `_fan_out_portraits` and `_fan_out_portraits_branched`. We need a module-scope semaphore that the new `_hero_task` helper can also use.

In `backend/app/services/orchestrator.py`, near the existing `PORTRAIT_CONCURRENCY` constant (search for that string), add:

```python
PORTRAIT_CONCURRENCY = 3  # Gemini image gen rate-limits aggressively per minute
_PORTRAIT_SEM: asyncio.Semaphore | None = None


def _portrait_sem() -> asyncio.Semaphore:
    """Lazy module-scope semaphore — created on first call so it binds to the
    running event loop (constructing at import time can break under multiple
    loops in tests)."""
    global _PORTRAIT_SEM
    if _PORTRAIT_SEM is None:
        _PORTRAIT_SEM = asyncio.Semaphore(PORTRAIT_CONCURRENCY)
    return _PORTRAIT_SEM
```

Then update both fan-out functions to use it. Find the two `sem = asyncio.Semaphore(PORTRAIT_CONCURRENCY)` lines (one in `_fan_out_portraits`, one in `_fan_out_portraits_branched`) and replace each with:

```python
    sem = _portrait_sem()
```

- [ ] **Step 2: Add a `_hero_portrait_task` helper near the other helpers**

Before the `# Portrait fan-out` comment block in `backend/app/services/orchestrator.py`, add:

```python
def _hero_portrait_task(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    target_age: int,
    completed: list[Checkpoint],
) -> "asyncio.Task[AgedPortrait | None]":
    """Schedule the hero (target-year, high) portrait. Returns the Task so the
    caller can await it concurrently with finalize. Uses the shared portrait
    semaphore so it never overlaps the post-complete fan-out beyond the cap.
    Returns None when generation fails (caller treats that as 'no hero')."""
    async def _run() -> AgedPortrait | None:
        async with _portrait_sem():
            p = await generate_aged_portrait(
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                profile=profile,
                target_age=target_age,
                target_year=profile.targetYear,
                trajectory="high",
                relevant_events=completed,
            )
        return p if p.imageUrl is not None else None

    return asyncio.create_task(_run())
```

- [ ] **Step 3: Write the failing test (parallel timing)**

Create `backend/tests/test_orchestrator_parallel_hero.py`:

```python
"""Verify hero portrait runs concurrently with finalize (not serially after).

We measure with a controlled clock: each fake call sleeps a known amount,
and we assert the wall-clock total is closer to max(times) than sum(times).
"""

import asyncio
import time
from unittest.mock import patch

import pytest

from app.models import AgedPortrait, Checkpoint, Profile, SimulationData
from app.models.orchestration import AgentSpec, OutlineEvent


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


_AGENTS = [
    AgentSpec(agent_id="user", role="user", name="Sam",
              relationship="protagonist", voice="tired"),
]


def _original_sim() -> SimulationData:
    return SimulationData(
        profile=_profile(),
        agents=_AGENTS,
        agedPortraits=[],
        checkpointsHigh=[
            Checkpoint(year=2028, age=34, title="t", event="e", did="d",
                       consequence="c", tone="neutral"),
        ],
        checkpointsLow=[],
        futureSelfOpening="hi",
        futureSelfReplies={"q": "a"},
    )


@pytest.mark.asyncio
async def test_hero_runs_concurrent_with_finalize(monkeypatch) -> None:
    from app.services import orchestrator as orch

    FINALIZE_DELAY = 0.4   # seconds
    PORTRAIT_DELAY = 0.4   # seconds

    async def slow_finalize(profile, agents, checkpoints, router):
        await asyncio.sleep(FINALIZE_DELAY)
        return {
            "futureSelfOpening": "hi",
            "futureSelfReplies": {
                "What did I get wrong?": "a",
                "Am I happy?": "b",
                "What should I change?": "c",
            },
        }

    async def slow_portrait(*, target_age, target_year, trajectory, **_kwargs):
        await asyncio.sleep(PORTRAIT_DELAY)
        return AgedPortrait(
            age=target_age, year=target_year, trajectory=trajectory,
            imageUrl="data:image/png;base64,FAKE",
        )

    async def fake_plan(profile, agents, kept, intervention, router):
        return [OutlineEvent(year=2040, severity=0.5, primary_actors=["user"],
                             visibility=["user"], hint="h")]

    async def fake_detail(profile, agents, full_outline, completed, batch, router):
        return [Checkpoint(year=2040, age=46, title="t", event="e", did="d",
                           consequence="c", tone="neutral") for _ in batch]

    async def fake_alternate(profile, checkpoints, router):
        return [Checkpoint(year=2040, age=46, title="alt", event="e", did="d",
                           consequence="c", tone="neutral")]

    monkeypatch.setattr(orch, "_plan_branched_outline", fake_plan)
    monkeypatch.setattr(orch, "_detail_batch", fake_detail)
    monkeypatch.setattr(orch, "_finalize", slow_finalize)
    monkeypatch.setattr(orch, "_alternate", fake_alternate)

    # We need a real selfie blob so the hero path fires. The actual gemini
    # api key gate also matters — patch settings to enable the path.
    class _FakeSettings:
        anthropic_api_key = "x"
        gemini_api_key = "x"

    monkeypatch.setattr(orch, "get_settings", lambda: _FakeSettings())

    with patch.object(orch, "generate_aged_portrait", side_effect=slow_portrait):
        start = time.perf_counter()
        events = []
        async for ev in orch.stream_branched_simulation(
            profile=_profile(),
            intervention={"year": 2036, "text": "I quit"},
            original_simulation=_original_sim(),
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
        ):
            events.append(ev)
            if ev["phase"] == "complete":
                break
        elapsed = time.perf_counter() - start

    # Concurrent: total ≈ max(finalize, portrait) ≈ 0.4s.
    # Serial would be ≈ finalize + portrait ≈ 0.8s.
    # Allow generous slack for scheduling jitter on CI.
    assert elapsed < 0.7, (
        f"hero+finalize ran serially (elapsed={elapsed:.2f}s, expected ~0.4s)"
    )

    completes = [e for e in events if e["phase"] == "complete"]
    assert len(completes) == 1
    assert completes[0]["simulation"]["agedPortraits"]  # hero made it in
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_parallel_hero.py -v
```

Expected: FAIL — current code runs hero serially after finalize/alternate, so elapsed ≈ 0.8s, exceeding the 0.7s budget.

- [ ] **Step 5: Refactor the tail of `stream_branched_simulation`**

In `backend/app/services/orchestrator.py`, find the block at lines 290–321 (`# 5. Finalize + alternate over the FULL trajectory ...`). Replace from `yield {"phase": "finalizing"}` through the `yield {"phase": "complete", ...}` line with:

```python
        # 5. Finalize + alternate + hero portrait, all in parallel — they
        # share the `completed` snapshot but compute independent outputs.
        # NOTE: when alternate-removal lands in another worktree, the
        # alternate_task line below is the one to delete.
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))
        alternate_task = asyncio.create_task(_alternate(profile, completed, router))

        ages_b = _compute_ages(profile)
        hero_task: asyncio.Task[AgedPortrait | None] | None = None
        if selfie_bytes and settings.gemini_api_key:
            hero_task = _hero_portrait_task(
                profile=profile,
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                target_age=ages_b[-1],
                completed=completed,
            )

        final_payload, alternate_cps = await asyncio.gather(finalize_task, alternate_task)
        hero = await hero_task if hero_task is not None else None
        hero_portraits: list[AgedPortrait] = [hero] if hero is not None else []

        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}
```

- [ ] **Step 6: Apply the same refactor to `stream_simulation`**

In `backend/app/services/orchestrator.py`, find the block at lines 91–124 (`# 4. Finalize + alternate path in parallel ...` through `yield {"phase": "complete", ...}`). Replace from `yield {"phase": "finalizing"}` through the `yield {"phase": "complete", ...}` line with:

```python
        # 4. Finalize + alternate + hero portrait, all in parallel.
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))
        alternate_task = asyncio.create_task(_alternate(profile, completed, router))

        ages = _compute_ages(profile)
        hero_task: asyncio.Task[AgedPortrait | None] | None = None
        if selfie_bytes and settings.gemini_api_key:
            hero_task = _hero_portrait_task(
                profile=profile,
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                target_age=ages[-1],
                completed=completed,
            )

        final_payload, alternate_cps = await asyncio.gather(finalize_task, alternate_task)
        hero = await hero_task if hero_task is not None else None
        hero_portraits: list[AgedPortrait] = [hero] if hero is not None else []

        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}
```

(Note: the existing `ages = _compute_ages(profile)` on the original line 99 is now subsumed by the `ages = _compute_ages(profile)` shown above — verify no second copy survives the edit.)

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_parallel_hero.py -v
```

Expected: PASS — elapsed should now be ≈ 0.4s.

- [ ] **Step 8: Run the full backend suite**

```bash
cd backend && source .venv/bin/activate && pytest -x
```

Expected: all pass. The fan-out tests use `_portrait_sem()` now via the small change in Step 1 — they should still work because the lazy semaphore initializer creates one on demand.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/orchestrator.py \
        backend/tests/test_orchestrator_parallel_hero.py
git commit -m "perf: parallelize hero portrait with finalize/alternate

The hero portrait is now scheduled as an asyncio.Task at the same
moment as finalize and alternate. All three share the completed
checkpoint list as input but produce independent outputs, so they
overlap cleanly.

Wrapped in a module-scope PORTRAIT_CONCURRENCY semaphore so it
respects the same Gemini rate-limit cap as the post-complete fan-out
(belt-and-suspenders: in practice no other Gemini call is in flight
during this window because fan-out hasn't started yet).

Saves ~5-10s on both /simulate and /simulate/branch wall-clock.
"
```

---

## Task 5: Add prompt caching to high-signal LLM calls

**Goal:** The system prompt for `_plan_outline`, `_plan_branched_outline`, `_detail_batch`, and `_finalize` is wrapped in a cache-control block so Anthropic caches it across calls within a session. Other tiers (NOISE → Groq) are unaffected.

**Files:**
- Modify: `backend/app/routing/router.py`
- Modify: `backend/app/routing/plan_b_hosted.py`
- Test: `backend/tests/test_router_caching.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_router_caching.py`:

```python
"""Verify the hosted backend forwards system prompts as cache-controlled
blocks to Anthropic. Mocks the SDK so we can inspect what was sent."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import Settings
from app.routing.plan_b_hosted import HostedBackend
from app.routing.tiers import Tier


def _settings() -> Settings:
    return Settings(
        anthropic_api_key="test",
        anthropic_model_future_self="claude-opus-4-7",
        anthropic_model_high_signal="claude-sonnet-4-6",
        anthropic_model_peers="claude-sonnet-4-6",
        groq_api_key=None,
        groq_model_noise="llama-3.1-8b",
        gemini_api_key=None,
    )


@pytest.mark.asyncio
async def test_anthropic_call_uses_cache_control_on_system() -> None:
    """The system prompt should arrive at Anthropic as a list of blocks
    with cache_control set on each block, so Anthropic stores the prefix
    and only re-bills delta on subsequent calls within the same session."""
    backend = HostedBackend(_settings())

    fake_response = MagicMock()
    fake_response.content = [MagicMock(type="text", text="ok")]
    backend._anthropic.messages.create = AsyncMock(return_value=fake_response)

    await backend.complete(
        tier=Tier.HIGH_SIGNAL,
        system="LARGE-SYSTEM-PROMPT",
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=100,
    )

    kwargs = backend._anthropic.messages.create.call_args.kwargs
    system_arg = kwargs["system"]
    assert isinstance(system_arg, list), "system must be a list of blocks for caching"
    assert len(system_arg) == 1
    assert system_arg[0]["type"] == "text"
    assert system_arg[0]["text"] == "LARGE-SYSTEM-PROMPT"
    assert system_arg[0]["cache_control"] == {"type": "ephemeral"}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_router_caching.py -v
```

Expected: FAIL — current code passes `system` as a string, not a list of cache-controlled blocks.

- [ ] **Step 3: Update `_anthropic_complete` in `plan_b_hosted.py`**

In `backend/app/routing/plan_b_hosted.py`, replace the `_anthropic_complete` method (lines 33–52) with:

```python
    async def _anthropic_complete(
        self,
        tier: Tier,
        system: str,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        # Wrap the system prompt as a cache-controlled block so Anthropic
        # caches the (large, repeated) prefix across calls within a session.
        # System prompts under the model's minimum cache size silently fall
        # through to non-cached pricing — no correctness impact.
        # Newer Anthropic models (Opus 4.7+) reject `temperature` as deprecated;
        # use the default sampling and ignore the caller's hint.
        anthropic_tier = tier if tier != Tier.NOISE else Tier.PEERS
        model = self._anthropic_models[anthropic_tier]
        cached_system = [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ]
        resp = await self._anthropic.messages.create(
            model=model,
            system=cached_system,
            messages=messages,
            max_tokens=max_tokens,
        )
        return "".join(block.text for block in resp.content if block.type == "text")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_router_caching.py -v
```

Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

```bash
cd backend && source .venv/bin/activate && pytest -x
```

Expected: all pass. (No tests should break — the system-prompt-as-list shape is what the Anthropic SDK expects when caching; all live calls already go through this method.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/routing/plan_b_hosted.py backend/tests/test_router_caching.py
git commit -m "perf: add Anthropic prompt caching on system blocks

Every Anthropic call now ships its system prompt as a cache-controlled
block. Within a single user session, planner -> detail-batch (xN) ->
finalize all share the same TONE_BLOCK + tone-prompt prefix, so the
2nd+ call pays only delta tokens.

Resolves the long-standing TODO in plan_b_hosted.py.

Estimated savings: 3-8s aggregate per /simulate or /simulate/branch run.
"
```

---

## Task 6: Slim the `original_simulation` upload payload

**Goal:** The frontend strips base64 image bytes from `original_simulation.agedPortraits[*].imageUrl` before uploading to `/simulate/branch`, and re-attaches its in-memory copies after `complete`. The backend stops re-emitting preserved high portraits during fan-out (the FE already has them). This removes ~2MB of upload + parse on every intervention.

**Files:**
- Modify: `frontend/src/lib/api.ts:41-60` (`simulateBranchStream`)
- Modify: `frontend/src/screens/screens-b.tsx` (the `phase === "complete"` arm of `submitIntervention`, around line 523–536)
- Modify: `backend/app/services/orchestrator.py` (`_fan_out_portraits_branched`, around lines 593–603)
- Test: `backend/tests/test_orchestrator_branch_no_preserved_emit.py` (new)

- [ ] **Step 1: Write the failing backend test**

Create `backend/tests/test_orchestrator_branch_no_preserved_emit.py`:

```python
"""After this change, the branched fan-out should NOT re-emit pre-intervention
portraits — the frontend retains them locally. The fan-out still emits the
post-intervention high portraits (regenerated) and all low portraits."""

from unittest.mock import AsyncMock, patch

import pytest

from app.models import AgedPortrait, Checkpoint, Profile
from app.services.orchestrator import _fan_out_portraits_branched


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def _cps() -> list[Checkpoint]:
    return [
        Checkpoint(year=y, age=32 + (y - 2026), title="t", event="e",
                   did="d", consequence="c", tone="neutral")
        for y in (2028, 2031, 2034, 2038, 2042, 2046)
    ]


@pytest.mark.asyncio
async def test_branched_fanout_does_not_re_emit_preserved_high() -> None:
    profile = _profile()
    ages = [32, 37, 42, 47, 52]
    span = 20
    original_high = [
        AgedPortrait(
            age=a, year=profile.presentYear + round(span * (i / 4)),
            trajectory="high", imageUrl=f"data:image/png;base64,ORIGINAL-{i}",
        )
        for i, a in enumerate(ages)
    ]
    intervention = {"year": 2036, "text": "I quit"}  # cuts at index 2

    async def fake_gen(*, target_age, target_year, trajectory, **_kwargs):
        return AgedPortrait(
            age=target_age, year=target_year, trajectory=trajectory,
            imageUrl=f"data:image/png;base64,REGEN-{trajectory}-{target_age}",
        )

    with patch("app.services.orchestrator.generate_aged_portrait",
               new=AsyncMock(side_effect=fake_gen)):
        events = []
        async for ev in _fan_out_portraits_branched(
            profile=profile, selfie_bytes=b"x", selfie_mime="image/jpeg",
            high=_cps(), low=_cps(), ages=ages,
            intervention=intervention,
            original_portraits=original_high,
        ):
            events.append(ev)

    high_events = [e for e in events if e["phase"] == "portrait" and e["trajectory"] == "high"]
    # No "ORIGINAL-..." imageUrls should appear — the FE owns those now.
    assert all("ORIGINAL" not in e["portrait"]["imageUrl"] for e in high_events)
    # Indices 0 and 1 are pre-intervention (and not the hero) — they should
    # be entirely absent from the emitted events.
    emitted_indices = {e["index"] for e in high_events}
    assert 0 not in emitted_indices
    assert 1 not in emitted_indices
    # Indices 2 and 3 are post-intervention non-hero — regenerated and emitted.
    assert {2, 3}.issubset(emitted_indices)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_branch_no_preserved_emit.py -v
```

Expected: FAIL — current code re-emits indices 0 and 1 with the original imageUrls. Also note the existing test `test_branched_portrait_fanout_preserves_pre_intervention_high` will need updating in step 4.

- [ ] **Step 3: Stop re-emitting preserved high portraits in the backend**

In `backend/app/services/orchestrator.py`, find inside `_fan_out_portraits_branched` (around lines 593–604) the loop that yields preserved portraits:

```python
    preserved_indices: set[int] = set()
    for i, _age in enumerate(ages):
        year = profile.presentYear + round(span * (i / 4))
        if year < iv_year and year in by_year_high:
            yield {
                "phase": "portrait",
                "trajectory": "high",
                "index": i,
                "portrait": by_year_high[year].model_dump(),
            }
            preserved_indices.add(i)
```

Replace with:

```python
    # Pre-intervention high portraits stay in the frontend's existing state
    # — we don't re-emit them. We just track the indices so the regeneration
    # loop below knows to skip them.
    preserved_indices: set[int] = set()
    for i, _age in enumerate(ages):
        year = profile.presentYear + round(span * (i / 4))
        if year < iv_year and year in by_year_high:
            preserved_indices.add(i)
```

(The `by_year_high` lookup is now used only as a "is this index preserved?" set test. Could simplify further later, but leave it for clarity.)

- [ ] **Step 4: Update the existing fan-out test that asserted preservation**

In `backend/tests/test_orchestrator_portraits.py`, find `test_branched_portrait_fanout_preserves_pre_intervention_high` (around line 77). Update its assertions: the test currently asserts that indices 0 and 1 carry "ORIGINAL-" imageUrls. After this change they should be absent entirely.

Replace the body of that test from `assert len(high_events) == 4` to the end with:

```python
    # Hero (index 4) is generated by the caller before phase: "complete".
    # Pre-intervention high portraits (indices 0, 1) are NOT re-emitted —
    # the frontend retains them locally. So fan-out emits only indices 2, 3
    # (regenerated post-intervention high) plus 5 low.
    assert {e["index"] for e in high_events} == {2, 3}
    assert all("REGEN" in e["portrait"]["imageUrl"] for e in high_events)
    assert len(low_events) == 5
```

- [ ] **Step 5: Run both tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && \
    pytest tests/test_orchestrator_branch_no_preserved_emit.py tests/test_orchestrator_portraits.py -v
```

Expected: PASS for both.

- [ ] **Step 6: Slim the upload payload on the frontend**

Edit `frontend/src/lib/api.ts`. Replace the body of `simulateBranchStream` (lines 41–60) with:

```ts
export async function* simulateBranchStream(
  profile: Profile,
  interventionYear: number,
  interventionText: string,
  originalSimulation: SimulationData,
  selfie: Blob | null,
): AsyncIterableIterator<StreamEvent> {
  const form = new FormData();
  form.append("profile", JSON.stringify(profile));
  form.append("intervention_year", String(interventionYear));
  form.append("intervention_text", interventionText);
  // Strip the base64 image bytes — the backend only needs the (year, trajectory)
  // metadata to decide which portraits to skip regenerating; the FE retains
  // the full images locally and re-attaches them on `phase: complete`.
  const slim: SimulationData = {
    ...originalSimulation,
    agedPortraits: originalSimulation.agedPortraits.map((p) => ({
      ...p,
      imageUrl: null,
    })),
  };
  form.append("original_simulation", JSON.stringify(slim));
  if (selfie) form.append("selfie", selfie, "selfie.jpg");
  yield* readNDJSON(
    await fetch(`${BASE}/simulate/branch`, {
      method: "POST",
      body: form,
    }),
  );
}
```

- [ ] **Step 7: Re-attach preserved portraits on `complete` in the frontend**

Edit `frontend/src/screens/screens-b.tsx`. Find the `} else if (ev.phase === "complete") {` arm of the `submitIntervention` `for await` loop (around lines 523–536). Replace from that line through (and including) the closing `setTimelineViewed(true);` with:

```tsx
        } else if (ev.phase === "complete") {
          // The backend no longer re-emits pre-intervention high portraits to
          // save upload bytes — it strips them out. We retain the originals
          // locally and re-merge them here so the slider/encore screens still
          // have early-life faces.
          const preservedHigh = (originalSim.agedPortraits ?? []).filter(
            (p) => p.trajectory === "high" && p.year < cp.year,
          );
          setSimulation({
            ...ev.simulation,
            agedPortraits: [...preservedHigh, ...ev.simulation.agedPortraits],
          });
          setRewriting(null);
          // Drop the user at the end of the new trajectory, no replay — they
          // just watched it materialize. They can scrub or intervene again.
          userScrolledRef.current = false;
          setT(1);
          setAutoplay(false);
          setTimelineViewed(true);
```

(Leave the trailing `// Don't break — keep iterating ...` comment and `}` as-is.)

- [ ] **Step 8: Verify frontend type-checks**

```bash
cd frontend && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 9: Run the full backend suite**

```bash
cd backend && source .venv/bin/activate && pytest -x
```

Expected: all pass.

- [ ] **Step 10: Manual end-to-end smoke (recommended, not gating)**

```bash
# Terminal A:
./scripts/dev.sh

# Terminal B:
cd frontend && npm run dev
```

Open the app in a browser, run a simulation through to the timeline, click "change this moment →" on a card, submit an intervention. Confirm:
- The new cards stream in.
- After `complete`, early-life portraits (years before the intervention) are still visible on the slider/encore screens — they came from the locally retained originals.
- Browser dev tools network tab shows `original_simulation` form field is dramatically smaller than before (no base64 image data).

- [ ] **Step 11: Commit**

```bash
git add backend/app/services/orchestrator.py \
        backend/tests/test_orchestrator_branch_no_preserved_emit.py \
        backend/tests/test_orchestrator_portraits.py \
        frontend/src/lib/api.ts \
        frontend/src/screens/screens-b.tsx
git commit -m "perf: slim original_simulation upload on /simulate/branch

The frontend strips base64 image bytes from agedPortraits before
uploading the original_simulation. The backend no longer re-emits
preserved high portraits during fan-out — the frontend retains the
originals locally and re-merges them on phase: complete.

Saves ~2MB upload + multipart parse time per intervention. Removes
the round-trip of data the FE already owns.
"
```

---

## Self-Review

**Spec coverage check:**
- §1 Persist agents in SimulationData → Tasks 1, 2 ✅
- §2 Skip counting on branch → Task 3 ✅
- §3 Hero portrait runs in parallel with finalize → Task 4 ✅
- §4 Anthropic prompt caching → Task 5 ✅
- §5 Strip portraits from upload payload → Task 6 ✅
- Testing strategy items 1–4 in spec → covered by the per-task unit tests above
- Testing strategy item 5 (manual e2e smoke) → Task 6, Step 10
- Testing strategy item 6 (cache validation by inspecting `cache_read_input_tokens`) → not gated in this plan because it requires real Anthropic calls; should be a one-off verification after deploy. Adding a note here as a follow-up.

**Placeholder scan:** none of the "TBD / TODO / similar to Task N / appropriate error handling" patterns appear. All code is shown in full where touched.

**Type consistency:**
- `SimulationData` carries `agents: list[AgentSpec]` (backend) / `AgentSpec[]` (TS) consistently across Tasks 1–6.
- `_hero_portrait_task` returns `asyncio.Task[AgedPortrait | None]` and the awaited value is `AgedPortrait | None`; consumers wrap it in `[hero] if hero else []`.
- `_portrait_sem()` returns `asyncio.Semaphore`; both fan-out functions and `_hero_portrait_task` call it.

**Scope check:** plan addresses one perf project (the branch flow). Each task is independently revertible. Total code surface: 5 backend files, 4 frontend files, 5 new test files.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-branch-flow-perf.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
