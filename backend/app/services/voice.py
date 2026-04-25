"""ElevenLabs wrapper — synthesize voice for the future-self interview.

The voice tone is warm, tired, honest. Configurable via ELEVENLABS_VOICE_ID.
"""

from app.config import get_settings


async def synthesize(text: str) -> bytes:
    """TODO:
    - call ElevenLabs streaming TTS
    - return audio bytes (mp3)
    """
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise RuntimeError("ELEVENLABS_API_KEY not set")
    raise NotImplementedError
