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
from app.models import Checkpoint, Profile, SimulationData
from app.models.orchestration import AgentSpec, OutlineEvent
from app.prompts.orchestration import (
    ALTERNATE_SYSTEM,
    COUNTING_SYSTEM,
    DETAIL_SYSTEM,
    FINALIZE_SYSTEM,
    PLANNING_SYSTEM,
    render_alternate_user,
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_finalize_user,
    render_planning_user,
)
from app.routing import AgentRouter, Tier, get_router
from app.services.event_pool import filter_pool, format_pool_for_prompt
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

        # 4. Finalize + alternate path in parallel — both depend only on `completed`.
        # Emit an explicit phase so the frontend can show progress instead of
        # appearing to stall after the last event lands.
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))
        alternate_task = asyncio.create_task(_alternate(profile, completed, router))
        final_payload, alternate_cps = await asyncio.gather(finalize_task, alternate_task)

        sim = SimulationData(
            profile=profile,
            ages=_compute_ages(profile),
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}

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
) -> AsyncIterator[dict]:
    """Re-stream the trajectory after the user's intervention.

    Events from BEFORE intervention.year are preserved verbatim from
    `original_simulation.checkpointsHigh`. Only the post-intervention years
    are re-planned and re-detailed. Finalize + alternate use the full
    combined trajectory.
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
        # 1. Re-derive agents (we don't persist them in SimulationData).
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

        # 5. Finalize + alternate over the FULL trajectory (kept + new).
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))
        alternate_task = asyncio.create_task(_alternate(profile, completed, router))
        final_payload, alternate_cps = await asyncio.gather(finalize_task, alternate_task)

        sim = SimulationData(
            profile=profile,
            ages=_compute_ages(profile),
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}

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


async def _alternate(
    profile: Profile, checkpoints: list[Checkpoint], router: AgentRouter
) -> list[Checkpoint]:
    # Scale with event count — long horizons can produce 15+ checkpoints, and
    # the alternate path mirrors that length. 8000 covers the worst case.
    raw = await router.complete(
        tier=Tier.HIGH_SIGNAL,
        system=ALTERNATE_SYSTEM,
        messages=[
            {"role": "user", "content": render_alternate_user(profile, checkpoints)}
        ],
        max_tokens=8000,
    )
    data = _extract_json(raw, expect="array", phase="alternate")
    if not isinstance(data, list) or not data:
        raise OrchestrationError("alternate: empty checkpoint list")
    try:
        cps = [Checkpoint.model_validate(item) for item in data]
    except ValidationError as e:
        raise OrchestrationError(f"alternate: schema invalid: {e}") from e
    return [_correct_age(cp, profile) for cp in cps]


def _correct_age(cp: Checkpoint, profile: Profile) -> Checkpoint:
    """Force `age` to match the profile and year. The LLM sometimes gets it
    wrong; we always know the right answer deterministically."""
    correct = profile.age + (cp.year - profile.presentYear)
    if cp.age == correct:
        return cp
    return cp.model_copy(update={"age": correct})


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
