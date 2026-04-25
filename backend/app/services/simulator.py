"""POST /simulate — one big Claude call → SimulationData."""

import json
import re

from pydantic import ValidationError

from app.config import get_settings
from app.models import Profile, SimulationData
from app.prompts.simulator import SIMULATOR_SYSTEM_PROMPT, render_simulator_user_prompt
from app.routing import Tier, get_router


class SimulationError(RuntimeError):
    pass


_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


async def simulate(profile: Profile) -> SimulationData:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise SimulationError("ANTHROPIC_API_KEY not set")

    router = get_router()
    raw = await router.complete(
        tier=Tier.FUTURE_SELF,
        system=SIMULATOR_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": render_simulator_user_prompt(profile)}],
        max_tokens=8000,
        temperature=0.85,
    )
    return _parse(raw, profile)


def _parse(raw: str, profile: Profile) -> SimulationData:
    text = raw.strip()
    # Tolerate occasional fenced output even though we asked for none.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_BLOCK.search(text)
        if not match:
            raise SimulationError(f"model did not return JSON; got: {text[:300]!r}")
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError as e:
            raise SimulationError(f"could not parse JSON: {e}; raw: {text[:300]!r}")

    # Force-echo the input profile in case the model paraphrased it.
    data["profile"] = profile.model_dump()
    try:
        return SimulationData.model_validate(data)
    except ValidationError as e:
        raise SimulationError(f"simulation JSON failed schema: {e}") from e
