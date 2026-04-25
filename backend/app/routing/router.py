from functools import lru_cache
from typing import Protocol

from app.config import Settings, get_settings
from app.routing.tiers import Tier


class Backend(Protocol):
    async def complete(
        self,
        tier: Tier,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str: ...


class AgentRouter:
    """Backend-agnostic tiered router. Plan A or Plan B is selected at construction."""

    def __init__(self, backend: Backend):
        self._backend = backend

    async def complete(
        self,
        tier: Tier,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        return await self._backend.complete(tier, system, messages, max_tokens, temperature)


def _build_backend(settings: Settings) -> Backend:
    if settings.inference_plan.upper() == "A":
        from app.routing.plan_a_local import LocalGX10Backend

        return LocalGX10Backend(settings)
    from app.routing.plan_b_hosted import HostedBackend

    return HostedBackend(settings)


@lru_cache
def get_router() -> AgentRouter:
    return AgentRouter(_build_backend(get_settings()))
