"""ElevenLabs voice services: streaming TTS, Scribe STT, instant voice cloning."""

import io
from collections.abc import AsyncIterator

from elevenlabs.client import AsyncElevenLabs

from app.config import get_settings


class VoiceError(RuntimeError):
    pass


_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # ElevenLabs sample "Bella" — replace via env
_STT_MODEL_ID = "scribe_v1"


def _client() -> AsyncElevenLabs:
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise VoiceError("ELEVENLABS_API_KEY not set")
    return AsyncElevenLabs(api_key=settings.elevenlabs_api_key)


def _resolve_voice_id(voice_id: str | None) -> str:
    if voice_id:
        return voice_id
    settings = get_settings()
    return settings.elevenlabs_voice_id or _DEFAULT_VOICE_ID


async def synthesize(text: str, voice_id: str | None = None) -> AsyncIterator[bytes]:
    """Yield mp3 audio chunks as they arrive from ElevenLabs.

    If `voice_id` is provided (e.g., a session-cloned voice), it overrides the
    default; otherwise we fall back to settings.elevenlabs_voice_id and finally
    to the built-in Bella sample.
    """
    client = _client()
    resolved_voice_id = _resolve_voice_id(voice_id)
    try:
        stream = client.text_to_speech.stream(
            voice_id=resolved_voice_id,
            text=text,
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_128",
        )
        async for chunk in stream:
            if chunk:
                yield chunk
    except Exception as e:  # noqa: BLE001
        raise VoiceError(f"text-to-speech failed: {e}") from e


async def synthesize_primed(text: str, voice_id: str | None = None) -> AsyncIterator[bytes]:
    """Return a TTS iterator that's guaranteed to have produced a first chunk.

    StreamingResponse sends headers before consuming the iterator. Priming with
    one chunk lets us surface provider/config errors as a regular 502 instead of
    a misleading 200 with empty/truncated audio.
    """
    stream = synthesize(text, voice_id=voice_id)
    try:
        first_chunk = await anext(stream)
    except StopAsyncIteration as e:
        raise VoiceError("text-to-speech returned empty audio") from e

    async def _with_first() -> AsyncIterator[bytes]:
        yield first_chunk
        async for chunk in stream:
            yield chunk

    return _with_first()


async def transcribe(audio: bytes, filename: str = "audio.webm") -> str:
    """ElevenLabs Scribe — return transcribed text from the audio bytes."""
    if not audio:
        raise VoiceError("empty audio payload")
    client = _client()
    try:
        result = await client.speech_to_text.convert(
            file=(filename, audio),
            model_id=_STT_MODEL_ID,
        )
    except Exception as e:  # noqa: BLE001 — pass through as VoiceError
        raise VoiceError(f"speech-to-text failed: {e}") from e
    text = getattr(result, "text", None)
    if not text:
        raise VoiceError("speech-to-text returned no text")
    return text


async def clone_voice(
    samples: list[tuple[str, bytes]],
    name: str,
    description: str | None = None,
) -> str:
    """Instant Voice Cloning. Returns the new voice_id.

    `samples` is a list of (filename, bytes) tuples. ElevenLabs IVC works best
    with ~30–60s of clean audio across one or more files.
    """
    if not samples:
        raise VoiceError("no audio samples provided for cloning")
    client = _client()
    files = [io.BytesIO(data) for _, data in samples]
    for buf, (filename, _) in zip(files, samples, strict=False):
        buf.name = filename  # the SDK reads .name to infer mime
    try:
        voice = await client.voices.ivc.create(
            name=name,
            description=description or "AlterEgo session voice",
            files=files,
        )
    except Exception as e:  # noqa: BLE001
        raise VoiceError(f"voice cloning failed: {e}") from e
    voice_id = getattr(voice, "voice_id", None)
    if not voice_id:
        raise VoiceError("voice cloning returned no voice_id")
    return voice_id


async def delete_voice(voice_id: str) -> None:
    """Best-effort cleanup so we don't accumulate cloned voices on the account."""
    if not voice_id:
        return
    client = _client()
    try:
        await client.voices.delete(voice_id=voice_id)
    except Exception as e:  # noqa: BLE001
        raise VoiceError(f"voice delete failed: {e}") from e
