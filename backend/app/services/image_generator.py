"""Gemini image generation for aged portraits.

One public coroutine: `generate_aged_portrait`. Failures never raise — they
return an `AgedPortrait` with `imageUrl=None` so the orchestrator can stream
the failure as a `portrait_error` phase and continue with the rest.
"""

import asyncio
import base64
import logging
from typing import Any

from app.config import get_settings
from app.models import AgedPortrait, Checkpoint, Profile, Trajectory
from app.prompts.portrait import render_portrait_prompt

logger = logging.getLogger(__name__)


async def generate_aged_portrait(
    selfie_bytes: bytes,
    selfie_mime: str,
    profile: Profile,
    target_age: int,
    target_year: int,
    trajectory: Trajectory,
    relevant_events: list[Checkpoint],
) -> AgedPortrait:
    """Generate one aged portrait. Returns AgedPortrait with imageUrl=None on
    any failure (logged, not raised)."""
    prompt = render_portrait_prompt(
        profile=profile,
        target_age=target_age,
        target_year=target_year,
        trajectory=trajectory,
        relevant_events=relevant_events,
    )

    try:
        response = await _call_gemini(prompt, selfie_bytes, selfie_mime)
        image_bytes, mime = _extract_image(response)
    except Exception as e:  # noqa: BLE001 — surface nothing to the caller; degrade
        logger.warning(
            "portrait gen failed for age=%d year=%d trajectory=%s: %s",
            target_age, target_year, trajectory, e,
        )
        return AgedPortrait(age=target_age, year=target_year, trajectory=trajectory, imageUrl=None)

    if image_bytes is None:
        logger.warning(
            "portrait gen returned no image for age=%d year=%d trajectory=%s",
            target_age, target_year, trajectory,
        )
        return AgedPortrait(age=target_age, year=target_year, trajectory=trajectory, imageUrl=None)

    b64 = base64.b64encode(image_bytes).decode("ascii")
    return AgedPortrait(
        age=target_age,
        year=target_year,
        trajectory=trajectory,
        imageUrl=f"data:{mime};base64,{b64}",
    )


async def _call_gemini(prompt: str, selfie_bytes: bytes, selfie_mime: str) -> Any:
    """Thin wrapper around the google-genai SDK. Patched in tests."""
    from google import genai
    from google.genai import types

    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=settings.gemini_api_key)

    # google-genai is sync; offload to a thread to keep the event loop free.
    return await asyncio.to_thread(
        client.models.generate_content,
        model=settings.gemini_image_model,
        contents=[
            types.Part.from_bytes(data=selfie_bytes, mime_type=selfie_mime),
            prompt,
        ],
    )


def _extract_image(response: Any) -> tuple[bytes | None, str]:
    """Pull the first inline image out of a Gemini response. Returns
    (image_bytes, mime) — image_bytes is None when the response carries no
    image (e.g. the model refused or returned only text)."""
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            inline = getattr(part, "inline_data", None)
            if inline is not None and getattr(inline, "data", None):
                return inline.data, getattr(inline, "mime_type", "image/png") or "image/png"
    return None, "image/png"
