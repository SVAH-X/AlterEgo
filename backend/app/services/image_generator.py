"""Gemini image generation for aged portraits.

One public coroutine: `generate_aged_portrait`. Failures never raise — they
return an `AgedPortrait` with `imageUrl=None` so the orchestrator can stream
the failure as a `portrait_error` phase and continue with the rest.
"""

import asyncio
import base64
import logging
import re
from typing import Any

from app.config import get_settings
from app.models import AgedPortrait, Checkpoint, Profile, Trajectory
from app.prompts.portrait import render_portrait_prompt

logger = logging.getLogger(__name__)

# Retry budget for transient 429s — Gemini image gen has strict per-minute limits.
RATE_LIMIT_RETRIES = 1
RATE_LIMIT_DEFAULT_DELAY_SECONDS = 12.0
_RETRY_DELAY_PATTERN = re.compile(r"retry in ([0-9]+(?:\.[0-9]+)?)s", re.IGNORECASE)


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
    """Thin wrapper around the google-genai SDK. Patched in tests.

    Retries once on 429 RESOURCE_EXHAUSTED, honoring the server's suggested
    retryDelay when present (parsed from the error message)."""
    from google import genai
    from google.genai import types

    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=settings.gemini_api_key)

    last_exc: Exception | None = None
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            # google-genai is sync; offload to a thread to keep the event loop free.
            return await asyncio.to_thread(
                client.models.generate_content,
                model=settings.gemini_image_model,
                contents=[
                    types.Part.from_bytes(data=selfie_bytes, mime_type=selfie_mime),
                    prompt,
                ],
            )
        except Exception as e:  # noqa: BLE001 — caller handles all failures
            last_exc = e
            if attempt >= RATE_LIMIT_RETRIES or not _is_rate_limited(e):
                raise
            delay = _retry_delay_seconds(e)
            logger.info("portrait gen rate-limited, retrying in %.1fs", delay)
            await asyncio.sleep(delay)
    # Unreachable, but satisfies type-checker about the function always returning or raising.
    raise last_exc if last_exc else RuntimeError("portrait gen retry loop exited unexpectedly")


def _is_rate_limited(e: Exception) -> bool:
    msg = str(e)
    return "429" in msg or "RESOURCE_EXHAUSTED" in msg


def _retry_delay_seconds(e: Exception) -> float:
    m = _RETRY_DELAY_PATTERN.search(str(e))
    if m:
        try:
            return min(60.0, float(m.group(1)))  # cap at 60s so we don't hang forever
        except ValueError:
            pass
    return RATE_LIMIT_DEFAULT_DELAY_SECONDS


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
