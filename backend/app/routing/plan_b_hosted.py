from anthropic import AsyncAnthropic
from groq import AsyncGroq

from app.config import Settings
from app.routing.tiers import Tier


class HostedBackend:
    """Plan B — hosted APIs. Default for hackathon."""

    def __init__(self, settings: Settings):
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._groq = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None
        self._anthropic_models = {
            Tier.FUTURE_SELF: settings.anthropic_model_future_self,
            Tier.HIGH_SIGNAL: settings.anthropic_model_high_signal,
            Tier.PEERS: settings.anthropic_model_peers,
        }
        self._groq_noise_model = settings.groq_model_noise

    async def complete(
        self,
        tier: Tier,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        if tier == Tier.NOISE and self._groq is not None:
            return await self._groq_complete(system, messages, max_tokens, temperature)
        return await self._anthropic_complete(tier, system, messages, max_tokens, temperature)

    async def _anthropic_complete(
        self,
        tier: Tier,
        system: str,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        # TODO: enable prompt caching on `system` once character cards stabilize.
        anthropic_tier = tier if tier != Tier.NOISE else Tier.PEERS
        model = self._anthropic_models[anthropic_tier]
        resp = await self._anthropic.messages.create(
            model=model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return "".join(block.text for block in resp.content if block.type == "text")

    async def _groq_complete(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        full_messages = [{"role": "system", "content": system}, *messages]
        resp = await self._groq.chat.completions.create(
            model=self._groq_noise_model,
            messages=full_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.choices[0].message.content or ""
