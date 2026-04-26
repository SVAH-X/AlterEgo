"""Regression tests for app.services.voice.transcribe.

Bug: Scribe returning a successful response with an empty `.text` field (e.g.
silence, sub-second clip) was being raised as `VoiceError`, which the route
mapped to a 502. Empty transcription is a normal outcome and should return ""
so the caller can decide what to do with it.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.voice import VoiceError, transcribe


def _client_returning(text):
    """Build a mock _client() whose speech_to_text.convert returns text."""
    convert = AsyncMock(return_value=MagicMock(text=text))
    client = MagicMock()
    client.speech_to_text.convert = convert
    return client, convert


@pytest.mark.asyncio
async def test_transcribe_returns_text_on_success() -> None:
    client, convert = _client_returning("hello there")
    with patch("app.services.voice._client", return_value=client):
        result = await transcribe(b"opus-bytes", filename="answer.webm")
    assert result == "hello there"
    convert.assert_awaited_once()


@pytest.mark.asyncio
async def test_transcribe_returns_empty_string_when_scribe_text_is_none() -> None:
    """Scribe returns successfully but `.text` is None (silence/no speech)."""
    client, _ = _client_returning(None)
    with patch("app.services.voice._client", return_value=client):
        result = await transcribe(b"opus-bytes", filename="answer.webm")
    assert result == ""


@pytest.mark.asyncio
async def test_transcribe_returns_empty_string_when_scribe_text_is_blank() -> None:
    """Scribe returns successfully but `.text` is an empty string."""
    client, _ = _client_returning("")
    with patch("app.services.voice._client", return_value=client):
        result = await transcribe(b"opus-bytes", filename="answer.webm")
    assert result == ""


@pytest.mark.asyncio
async def test_transcribe_raises_voice_error_when_sdk_fails() -> None:
    """SDK exceptions (auth, rate limit, bad audio) MUST still raise."""
    client = MagicMock()
    client.speech_to_text.convert = AsyncMock(side_effect=RuntimeError("401 invalid_api_key"))
    with patch("app.services.voice._client", return_value=client):
        with pytest.raises(VoiceError) as exc_info:
            await transcribe(b"opus-bytes", filename="answer.webm")
    assert "speech-to-text failed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_transcribe_raises_on_empty_audio_payload() -> None:
    """Don't even hit Scribe with zero bytes — fail fast."""
    with pytest.raises(VoiceError) as exc_info:
        await transcribe(b"", filename="answer.webm")
    assert "empty audio payload" in str(exc_info.value)
