from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import AgedPortrait, Checkpoint, Profile
from app.services.image_generator import generate_aged_portrait


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def _checkpoint(year: int, age: int) -> Checkpoint:
    return Checkpoint(
        year=year, age=age, title="t", event="e", did="d", consequence="c",
    )


@pytest.mark.asyncio
async def test_generate_aged_portrait_returns_data_url_on_success() -> None:
    fake_image_bytes = b"\x89PNG\r\n\x1a\nfake"
    fake_response = MagicMock()
    fake_part = MagicMock()
    fake_part.inline_data = MagicMock(data=fake_image_bytes, mime_type="image/png")
    fake_part.text = None
    fake_response.candidates = [MagicMock(content=MagicMock(parts=[fake_part]))]

    with patch("app.services.image_generator._call_gemini", new=AsyncMock(return_value=fake_response)):
        portrait = await generate_aged_portrait(
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
            profile=_profile(),
            target_age=42,
            target_year=2036,
            trajectory="high",
            relevant_events=[_checkpoint(2030, 36)],
        )

    assert isinstance(portrait, AgedPortrait)
    assert portrait.age == 42
    assert portrait.year == 2036
    assert portrait.trajectory == "high"
    assert portrait.imageUrl is not None
    assert portrait.imageUrl.startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_generate_aged_portrait_returns_null_url_on_failure() -> None:
    with patch("app.services.image_generator._call_gemini", new=AsyncMock(side_effect=RuntimeError("boom"))):
        portrait = await generate_aged_portrait(
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
            profile=_profile(),
            target_age=42,
            target_year=2036,
            trajectory="low",
            relevant_events=[],
        )

    assert portrait.imageUrl is None
    assert portrait.trajectory == "low"


@pytest.mark.asyncio
async def test_generate_aged_portrait_returns_null_when_no_image_in_response() -> None:
    fake_response = MagicMock()
    fake_part = MagicMock()
    fake_part.inline_data = None
    fake_part.text = "I cannot generate that image."
    fake_response.candidates = [MagicMock(content=MagicMock(parts=[fake_part]))]

    with patch("app.services.image_generator._call_gemini", new=AsyncMock(return_value=fake_response)):
        portrait = await generate_aged_portrait(
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
            profile=_profile(),
            target_age=42,
            target_year=2036,
            trajectory="high",
            relevant_events=[],
        )

    assert portrait.imageUrl is None
