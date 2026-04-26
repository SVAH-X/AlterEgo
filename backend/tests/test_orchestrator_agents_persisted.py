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
