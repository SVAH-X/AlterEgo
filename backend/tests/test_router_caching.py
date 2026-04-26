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
        groq_api_key="",
        groq_model_noise="llama-3.1-8b",
        gemini_api_key="",
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
