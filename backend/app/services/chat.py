"""POST /chat — future-self reply, grounded in the SimulationData."""

from app.config import get_settings
from app.models import ChatRequest
from app.prompts.future_self import render_future_self_system
from app.routing import Tier, get_router


class ChatError(RuntimeError):
    pass


async def reply(req: ChatRequest) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise ChatError("ANTHROPIC_API_KEY not set")

    system = render_future_self_system(req.profile, req.simulation)
    messages = [
        {"role": "user" if m.role == "user" else "assistant", "content": m.text}
        for m in req.history
    ]
    messages.append({"role": "user", "content": req.user_text})

    router = get_router()
    try:
        return await router.complete(
            tier=Tier.HIGH_SIGNAL,  # Sonnet for chat — cheaper, faster turns
            system=system,
            messages=messages,
            max_tokens=600,
            temperature=0.8,
        )
    except Exception as e:  # noqa: BLE001
        raise ChatError(f"chat completion failed: {e}") from e
