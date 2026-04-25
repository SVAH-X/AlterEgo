"""ElevenLabs streaming TTS for the future-self voice."""

from collections.abc import AsyncIterator

from elevenlabs.client import AsyncElevenLabs

from app.config import get_settings


class VoiceError(RuntimeError):
    pass


_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # ElevenLabs sample "Bella" — replace via env


def _client() -> AsyncElevenLabs:
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise VoiceError("ELEVENLABS_API_KEY not set")
    return AsyncElevenLabs(api_key=settings.elevenlabs_api_key)


async def synthesize(text: str) -> AsyncIterator[bytes]:
    """Yield mp3 audio chunks as they arrive from ElevenLabs."""
    settings = get_settings()
    voice_id = settings.elevenlabs_voice_id or _DEFAULT_VOICE_ID
    client = _client()
    stream = client.text_to_speech.stream(
        voice_id=voice_id,
        text=text,
        model_id="eleven_turbo_v2_5",
        output_format="mp3_44100_128",
    )
    async for chunk in stream:
        if chunk:
            yield chunk
