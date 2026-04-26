"""After this change, the branched fan-out should NOT re-emit pre-intervention
portraits — the frontend retains them locally. The fan-out still emits the
post-intervention high portraits (regenerated)."""

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
            high=_cps(), ages=ages,
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
