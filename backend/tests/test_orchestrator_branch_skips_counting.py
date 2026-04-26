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

    monkeypatch.setattr(orch, "_plan_branched_outline", fake_plan)
    monkeypatch.setattr(orch, "_detail_batch", fake_detail)
    monkeypatch.setattr(orch, "_finalize", fake_finalize)
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
