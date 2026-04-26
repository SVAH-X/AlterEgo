"""Streaming multi-step orchestrator for /simulate.

Phases (NDJSON over the wire):
  counting → plan → event (× N) → complete

The frontend's processing screen subscribes to this stream and updates the
time-scaler UI as phases land.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Optional

from pydantic import ValidationError

from app.config import get_settings
from app.models import AgedPortrait, Checkpoint, Profile, SimulationData
from app.models.orchestration import AgentSpec, OutlineEvent
from app.prompts.orchestration import (
    COUNTING_SYSTEM,
    DETAIL_SYSTEM,
    FINALIZE_SYSTEM,
    PLANNING_SYSTEM,
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_finalize_user,
    render_planning_user,
)
from app.routing import AgentRouter, Tier, get_router
from app.services.event_pool import filter_pool, format_pool_for_prompt
from app.services.image_generator import generate_aged_portrait
from app.services.state_model import State, initial_state

DETAIL_BATCH_SIZE = 4

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)
_JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)


class OrchestrationError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Stream entry point

async def stream_simulation(
    profile: Profile,
    selfie_bytes: bytes | None = None,
    selfie_mime: str = "image/jpeg",
    intervention: Optional[dict] = None,
) -> AsyncIterator[dict]:
    """Stream a simulation. If `intervention` is provided (shape:
    `{"year": int, "text": str}`), the planner walks the trajectory under the
    user's stated counterfactual: at the given year, the user did X instead.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        yield {"phase": "error", "message": "ANTHROPIC_API_KEY not set"}
        return

    router = get_router()

    try:
        # 1. Counting
        agents = await _count_agents(profile, router)
        yield {"phase": "counting", "agents": [a.model_dump() for a in agents]}

        # 2. Planning
        outline = await _plan_outline(profile, agents, router, intervention)
        yield {"phase": "plan", "outline": [o.model_dump() for o in outline]}

        # 3. Detail-fill in batches; emit each event as soon as the batch returns.
        completed: list[Checkpoint] = []
        for start in range(0, len(outline), DETAIL_BATCH_SIZE):
            batch = outline[start : start + DETAIL_BATCH_SIZE]
            cps = await _detail_batch(profile, agents, outline, completed, batch, router)
            for i, cp in enumerate(cps):
                completed.append(cp)
                yield {
                    "phase": "event",
                    "index": start + i,
                    "checkpoint": cp.model_dump(),
                }

        # 4. Finalize + hero portrait, in parallel — both depend only on
        # `completed`, but produce independent outputs.
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))

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

        final_payload = await finalize_task
        hero = await hero_task if hero_task is not None else None
        hero_portraits: list[AgedPortrait] = [hero] if hero is not None else []

        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}
        # AMENDMENT A4: short-circuit on missing API key (silent skip per spec)
        if selfie_bytes and settings.gemini_api_key:
            async for ev in _fan_out_portraits(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, ages=ages,
            ):
                yield ev

    except OrchestrationError as e:
        yield {"phase": "error", "message": str(e)}
    except Exception as e:  # noqa: BLE001 — surface anything to the client
        yield {"phase": "error", "message": f"orchestrator: {type(e).__name__}: {e}"}


# ---------------------------------------------------------------------------
# Phase helpers

async def _count_agents(profile: Profile, router: AgentRouter) -> list[AgentSpec]:
    raw = await router.complete(
        tier=Tier.HIGH_SIGNAL,
        system=COUNTING_SYSTEM,
        messages=[{"role": "user", "content": render_counting_user(profile)}],
        max_tokens=2000,
    )
    data = _extract_json(raw, expect="array", phase="counting")
    if not isinstance(data, list) or not data:
        raise OrchestrationError("counting: model returned no agents")
    try:
        agents = [AgentSpec.model_validate(item) for item in data]
    except ValidationError as e:
        raise OrchestrationError(f"counting: schema invalid: {e}") from e
    if not any(a.agent_id == "user" for a in agents):
        # patch in a user agent if the model forgot
        agents.insert(
            0,
            AgentSpec(
                agent_id="user",
                role="user",
                name=profile.name or "You",
                relationship="the protagonist",
                voice="lived-in, tired, honest",
            ),
        )
    return agents


async def _plan_outline(
    profile: Profile,
    agents: list[AgentSpec],
    router: AgentRouter,
    intervention: Optional[dict] = None,
) -> list[OutlineEvent]:
    state = initial_state(profile)
    pool_events = filter_pool(profile)
    state_block = _format_state_block(state)
    pool_block = format_pool_for_prompt(pool_events)

    raw = await router.complete(
        tier=Tier.HIGH_SIGNAL,
        system=PLANNING_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": render_planning_user(
                    profile, agents, state_block, pool_block, intervention
                ),
            }
        ],
        max_tokens=3500,
    )
    data = _extract_json(raw, expect="object", phase="planning")
    outline_raw = data.get("outline") if isinstance(data, dict) else None
    if not isinstance(outline_raw, list) or not outline_raw:
        raise OrchestrationError("planning: model returned no outline")
    try:
        outline = [OutlineEvent.model_validate(item) for item in outline_raw]
    except ValidationError as e:
        raise OrchestrationError(f"planning: schema invalid: {e}") from e
    # Sort by year and enforce a hard ceiling — the model occasionally
    # over-produces. Keep highest-severity events when trimming.
    outline.sort(key=lambda o: o.year)
    outline = _trim_outline(outline, max_events=12)
    return outline


def _trim_outline(outline: list[OutlineEvent], max_events: int) -> list[OutlineEvent]:
    if len(outline) <= max_events:
        return outline
    # Keep the most-severe events; preserve chronological order in the result.
    kept_ids = {id(o) for o in sorted(outline, key=lambda o: -o.severity)[:max_events]}
    return [o for o in outline if id(o) in kept_ids]


def _format_state_block(state: State) -> str:
    return "\n".join(f"- {k}: {v:.2f}" for k, v in state.model_dump().items())


# ---------------------------------------------------------------------------
# Branched stream — preserves pre-intervention checkpoints, only re-plans
# the post-intervention years under the user's counterfactual.

async def stream_branched_simulation(
    profile: Profile,
    intervention: dict,
    original_simulation: SimulationData,
    selfie_bytes: bytes | None = None,
    selfie_mime: str = "image/jpeg",
) -> AsyncIterator[dict]:
    """Re-stream the trajectory after the user's intervention.

    Events from BEFORE intervention.year are preserved verbatim from
    `original_simulation.checkpointsHigh`. Only the post-intervention years
    are re-planned and re-detailed. Finalize uses the full combined trajectory.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        yield {"phase": "error", "message": "ANTHROPIC_API_KEY not set"}
        return

    iv_year = int(intervention["year"])
    router = get_router()

    # Split the original trajectory: keep events strictly before iv_year.
    kept = [c for c in original_simulation.checkpointsHigh if c.year < iv_year]

    try:
        # 1. Reuse the cast from the original simulation if present; only
        # fall back to a fresh count for pre-change sessions that didn't
        # persist agents (defensive — costs an LLM call when it triggers).
        if original_simulation.agents:
            agents = list(original_simulation.agents)
        else:
            agents = await _count_agents(profile, router)
        yield {"phase": "counting", "agents": [a.model_dump() for a in agents]}

        # 2. Plan only post-intervention years.
        new_outline = await _plan_branched_outline(
            profile, agents, kept, intervention, router
        )

        # Build a combined outline (kept events + new outline) so detail-fill
        # has the full timeline as context. Kept events are described from
        # their existing checkpoint content.
        synthetic_kept = [_checkpoint_to_outline(c) for c in kept]
        full_outline = synthetic_kept + new_outline
        yield {
            "phase": "plan",
            "outline": [o.model_dump() for o in full_outline],
        }

        # 3. Re-emit the kept checkpoints with their ORIGINAL indices so the
        # frontend can mark them as "preserved" (the FE already has them, but
        # this lets it confirm and stay in sync).
        for i, cp in enumerate(kept):
            yield {"phase": "event", "index": i, "checkpoint": cp.model_dump()}

        # 4. Detail-fill the NEW outline only.
        completed: list[Checkpoint] = list(kept)
        for start in range(0, len(new_outline), DETAIL_BATCH_SIZE):
            batch = new_outline[start : start + DETAIL_BATCH_SIZE]
            cps = await _detail_batch(profile, agents, full_outline, completed, batch, router)
            for j, cp in enumerate(cps):
                completed.append(cp)
                yield {
                    "phase": "event",
                    "index": len(kept) + start + j,
                    "checkpoint": cp.model_dump(),
                }

        # 5. Finalize + hero portrait over the FULL trajectory (kept + new),
        # in parallel — both share `completed` but produce independent outputs.
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))

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

        final_payload = await finalize_task
        hero = await hero_task if hero_task is not None else None
        hero_portraits: list[AgedPortrait] = [hero] if hero is not None else []

        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}
        # AMENDMENT A4: silent skip on missing key (same as stream_simulation)
        if selfie_bytes and settings.gemini_api_key:
            async for ev in _fan_out_portraits_branched(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, ages=ages_b,
                intervention=intervention,
                original_portraits=original_simulation.agedPortraits,
            ):
                yield ev

    except OrchestrationError as e:
        yield {"phase": "error", "message": str(e)}
    except Exception as e:  # noqa: BLE001
        yield {"phase": "error", "message": f"branched: {type(e).__name__}: {e}"}


async def _plan_branched_outline(
    profile: Profile,
    agents: list[AgentSpec],
    kept: list[Checkpoint],
    intervention: dict,
    router: AgentRouter,
) -> list[OutlineEvent]:
    """Plan ONLY events at or after intervention.year. The kept events are
    backstory; the model must not reproduce them, only react from them."""
    state = initial_state(profile)
    pool_events = filter_pool(profile)
    state_block = _format_state_block(state)
    pool_block = format_pool_for_prompt(pool_events)
    kept_block = _format_kept_checkpoints(kept) if kept else "(none — intervention is in the very first year)"

    raw = await router.complete(
        tier=Tier.HIGH_SIGNAL,
        system=PLANNING_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": render_branched_planning_user(
                    profile, agents, state_block, pool_block, intervention, kept_block
                ),
            }
        ],
        max_tokens=3500,
    )
    data = _extract_json(raw, expect="object", phase="planning")
    outline_raw = data.get("outline") if isinstance(data, dict) else None
    if not isinstance(outline_raw, list) or not outline_raw:
        raise OrchestrationError("branched planning: model returned no outline")
    try:
        outline = [OutlineEvent.model_validate(item) for item in outline_raw]
    except ValidationError as e:
        raise OrchestrationError(f"branched planning: schema invalid: {e}") from e
    iv_year = int(intervention["year"])
    # Drop anything the model might have produced for a year before the
    # intervention (model occasionally re-plans pre-intervention events).
    outline = [o for o in outline if o.year >= iv_year]
    outline.sort(key=lambda o: o.year)
    # Cap so kept + new ≤ 12 total.
    remaining_cap = max(1, 12 - len(kept))
    outline = _trim_outline(outline, max_events=remaining_cap)
    return outline


def _checkpoint_to_outline(c: Checkpoint) -> OutlineEvent:
    """Synthetic OutlineEvent for a kept Checkpoint — used only as context for
    detail-fill batches that come after."""
    return OutlineEvent(
        year=c.year,
        severity=0.6,
        primary_actors=["user"],
        visibility=["user"],
        hint=c.title,
    )


def _format_kept_checkpoints(kept: list[Checkpoint]) -> str:
    return "\n".join(
        f"- {c.year} (age {c.age}): {c.title}. {c.event} {c.consequence}"
        for c in kept
    )


async def _detail_batch(
    profile: Profile,
    agents: list[AgentSpec],
    full_outline: list[OutlineEvent],
    completed: list[Checkpoint],
    batch: list[OutlineEvent],
    router: AgentRouter,
) -> list[Checkpoint]:
    raw = await router.complete(
        tier=Tier.HIGH_SIGNAL,
        system=DETAIL_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": render_detail_user(
                    profile, agents, full_outline, completed, batch
                ),
            }
        ],
        max_tokens=6000,
    )
    data = _extract_json(raw, expect="array", phase="detail")
    if not isinstance(data, list) or len(data) != len(batch):
        raise OrchestrationError(
            f"detail: expected {len(batch)} checkpoints, got {len(data) if isinstance(data, list) else 'non-list'}"
        )
    try:
        cps = [Checkpoint.model_validate(item) for item in data]
    except ValidationError as e:
        raise OrchestrationError(f"detail: schema invalid: {e}") from e
    # The model occasionally miscalculates `age` from `year`. Recompute it
    # deterministically: age at year Y = profile.age + (Y - profile.presentYear).
    return [_correct_age(cp, profile) for cp in cps]


async def _finalize(
    profile: Profile,
    agents: list[AgentSpec],
    checkpoints: list[Checkpoint],
    router: AgentRouter,
) -> dict:
    raw = await router.complete(
        tier=Tier.HIGH_SIGNAL,
        system=FINALIZE_SYSTEM,
        messages=[
            {"role": "user", "content": render_finalize_user(profile, agents, checkpoints)}
        ],
        max_tokens=2000,
    )
    data = _extract_json(raw, expect="object", phase="finalize")
    if not isinstance(data, dict):
        raise OrchestrationError("finalize: not an object")
    if "futureSelfOpening" not in data or "futureSelfReplies" not in data:
        raise OrchestrationError("finalize: missing futureSelfOpening or futureSelfReplies")
    replies = data["futureSelfReplies"]
    required_keys = {"What did I get wrong?", "Am I happy?", "What should I change?"}
    if not isinstance(replies, dict) or set(replies.keys()) < required_keys:
        raise OrchestrationError(
            f"finalize: futureSelfReplies missing required keys (got {list(replies.keys()) if isinstance(replies, dict) else 'non-dict'})"
        )
    return data


def _correct_age(cp: Checkpoint, profile: Profile) -> Checkpoint:
    """Force `age` to match the profile and year. The LLM sometimes gets it
    wrong; we always know the right answer deterministically."""
    correct = profile.age + (cp.year - profile.presentYear)
    if cp.age == correct:
        return cp
    return cp.model_copy(update={"age": correct})


# ---------------------------------------------------------------------------
# Portrait fan-out

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


def _reset_portrait_sem_for_tests() -> None:
    """Test-only: clear the cached semaphore so the next caller binds to a fresh loop."""
    global _PORTRAIT_SEM
    _PORTRAIT_SEM = None


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


async def _fan_out_portraits(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    high: list[Checkpoint],
    ages: list[int],
) -> AsyncIterator[dict]:
    """Fire one Gemini call per high-trajectory anchor — 5 total — and yield
    each result as it lands. Failures are emitted as 'portrait_error' events.
    Successes are emitted as 'portrait' events with the AgedPortrait inline.
    Concurrency is capped via PORTRAIT_CONCURRENCY to avoid per-minute 429s."""
    span = profile.targetYear - profile.presentYear
    sem = _portrait_sem()

    def _events_up_to(cps: list[Checkpoint], year: int) -> list[Checkpoint]:
        return [c for c in cps if c.year <= year]

    async def _one(index: int, age: int) -> dict:
        year = profile.presentYear + round(span * (index / 4))
        async with sem:
            portrait = await generate_aged_portrait(
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                profile=profile,
                target_age=age,
                target_year=year,
                trajectory="high",
                relevant_events=_events_up_to(high, year),
            )
        if portrait.imageUrl is None:
            return {
                "phase": "portrait_error",
                "trajectory": "high",
                "index": index,
                "message": "image generation failed",
            }
        return {
            "phase": "portrait",
            "trajectory": "high",
            "index": index,
            "portrait": portrait.model_dump(),
        }

    # The hero portrait (final-year, high trajectory) is generated by the
    # caller BEFORE phase: "complete" so it's already in the SimulationData
    # payload. Skip it here to avoid duplicating it via mergePortrait.
    hero_idx = len(ages) - 1

    tasks = [
        asyncio.create_task(_one(i, age))
        for i, age in enumerate(ages)
        if i != hero_idx
    ]

    for coro in asyncio.as_completed(tasks):
        yield await coro


async def _fan_out_portraits_branched(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    high: list[Checkpoint],
    ages: list[int],
    intervention: dict,
    original_portraits: list[AgedPortrait],
) -> AsyncIterator[dict]:
    """Branched-mode portrait fan-out.

    - High portraits with year < intervention['year'] are preserved verbatim
      from `original_portraits` and re-emitted with their original index.
    - High portraits with year >= intervention['year'] are regenerated."""
    iv_year = int(intervention["year"])
    span = profile.targetYear - profile.presentYear

    def _events_up_to(cps: list[Checkpoint], year: int) -> list[Checkpoint]:
        return [c for c in cps if c.year <= year]

    # Lookup table for preserved high portraits (year -> portrait).
    by_year_high = {p.year: p for p in original_portraits if p.trajectory == "high"}
    sem = _portrait_sem()

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

    async def _one(index: int, age: int) -> dict:
        year = profile.presentYear + round(span * (index / 4))
        async with sem:
            portrait = await generate_aged_portrait(
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                profile=profile,
                target_age=age,
                target_year=year,
                trajectory="high",
                relevant_events=_events_up_to(high, year),
            )
        if portrait.imageUrl is None:
            return {
                "phase": "portrait_error",
                "trajectory": "high",
                "index": index,
                "message": "image generation failed",
            }
        return {
            "phase": "portrait",
            "trajectory": "high",
            "index": index,
            "portrait": portrait.model_dump(),
        }

    # Hero (final-year high) is generated by the caller BEFORE phase: "complete".
    hero_idx = len(ages) - 1

    tasks = [
        asyncio.create_task(_one(i, age))
        for i, age in enumerate(ages)
        if i not in preserved_indices and i != hero_idx
    ]

    for coro in asyncio.as_completed(tasks):
        yield await coro


# ---------------------------------------------------------------------------
# Helpers

def _compute_ages(profile: Profile) -> list[int]:
    """Five ages from present to target, evenly spaced."""
    span = profile.targetYear - profile.presentYear
    return [profile.age + round(span * frac) for frac in (0.0, 0.25, 0.5, 0.75, 1.0)]


def _extract_json(raw: str, *, expect: str, phase: str):
    """Parse JSON out of an LLM response. Tolerate fenced output and prose noise."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    pattern = _JSON_ARRAY_RE if expect == "array" else _JSON_OBJECT_RE
    m = pattern.search(text)
    if not m:
        raise OrchestrationError(f"{phase}: no JSON {expect} in response: {text[:200]!r}")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise OrchestrationError(f"{phase}: malformed JSON: {e}; raw: {text[:200]!r}") from e
