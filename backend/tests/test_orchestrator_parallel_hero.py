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

    async def fake_clinical(profile, checkpoints, router):
        return None

    monkeypatch.setattr(orch, "_plan_branched_outline", fake_plan)
    monkeypatch.setattr(orch, "_detail_batch", fake_detail)
    monkeypatch.setattr(orch, "_finalize", slow_finalize)
    monkeypatch.setattr(orch, "_generate_clinical_summary", fake_clinical)

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
