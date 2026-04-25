from openai import AsyncOpenAI

from app.config import Settings
from app.routing.tiers import Tier


class LocalGX10Backend:
    """Plan A — local open-weight inference on ASUS GX10.

    Talks to an OpenAI-compatible endpoint served by vLLM / llama.cpp / Ollama.
    Specific model identifiers are configured per-tier via env vars; selection
    is deferred until the GX10 is in hand and we can test what fits.
    """

    def __init__(self, settings: Settings):
        self._client = AsyncOpenAI(
            base_url=settings.gx10_base_url,
            api_key=settings.gx10_api_key,
        )
        self._models = {
            Tier.FUTURE_SELF: settings.gx10_model_future_self,
            Tier.HIGH_SIGNAL: settings.gx10_model_high_signal,
            Tier.PEERS: settings.gx10_model_peers,
            Tier.NOISE: settings.gx10_model_noise,
        }

    async def complete(
        self,
        tier: Tier,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        model = self._models.get(tier)
        if not model:
            raise RuntimeError(
                f"Plan A: no GX10 model configured for tier {tier.value}. "
                "Set GX10_MODEL_* env vars after hardware bringup."
            )
        full_messages = [{"role": "system", "content": system}, *messages]
        resp = await self._client.chat.completions.create(
            model=model,
            messages=full_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.choices[0].message.content or ""
