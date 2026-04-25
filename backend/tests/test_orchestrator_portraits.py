from unittest.mock import AsyncMock, patch

import pytest

from app.models import AgedPortrait, Checkpoint, Profile
from app.services.orchestrator import _fan_out_portraits


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def _cps() -> list[Checkpoint]:
    return [
        Checkpoint(year=y, age=32 + (y - 2026), title="t", event="e", did="d", consequence="c")
        for y in (2028, 2031, 2034, 2038, 2042, 2046)
    ]


@pytest.mark.asyncio
async def test_fan_out_portraits_emits_one_event_per_anchor() -> None:
    """fan_out_portraits emits exactly 10 portrait events (5 high + 5 low),
    one per (trajectory, index)."""
    async def fake_gen(*, target_age, target_year, trajectory, **_kwargs):
        return AgedPortrait(
            age=target_age, year=target_year, trajectory=trajectory,
            imageUrl=f"data:image/png;base64,FAKE-{trajectory}-{target_age}",
        )

    high = _cps()
    low = _cps()

    with patch("app.services.orchestrator.generate_aged_portrait", new=AsyncMock(side_effect=fake_gen)):
        events = []
        async for ev in _fan_out_portraits(
            profile=_profile(), selfie_bytes=b"x", selfie_mime="image/jpeg",
            high=high, low=low, ages=[32, 37, 42, 47, 52],
        ):
            events.append(ev)

    portrait_events = [e for e in events if e["phase"] == "portrait"]
    assert len(portrait_events) == 10
    high_events = [e for e in portrait_events if e["trajectory"] == "high"]
    low_events = [e for e in portrait_events if e["trajectory"] == "low"]
    assert len(high_events) == 5
    assert len(low_events) == 5
    assert {e["index"] for e in high_events} == {0, 1, 2, 3, 4}


@pytest.mark.asyncio
async def test_fan_out_portraits_emits_portrait_error_on_null_url() -> None:
    async def fake_gen(*, target_age, target_year, trajectory, **_kwargs):
        return AgedPortrait(age=target_age, year=target_year, trajectory=trajectory, imageUrl=None)

    with patch("app.services.orchestrator.generate_aged_portrait", new=AsyncMock(side_effect=fake_gen)):
        events = []
        async for ev in _fan_out_portraits(
            profile=_profile(), selfie_bytes=b"x", selfie_mime="image/jpeg",
            high=_cps(), low=_cps(), ages=[32, 37, 42, 47, 52],
        ):
            events.append(ev)

    error_events = [e for e in events if e["phase"] == "portrait_error"]
    assert len(error_events) == 10  # all failed -> all error events
