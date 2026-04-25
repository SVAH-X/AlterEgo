"""Voice I/O endpoints: TTS, STT, and instant voice cloning."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.voice import (
    VoiceError,
    clone_voice,
    delete_voice,
    synthesize,
    transcribe,
)

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


class STTResponse(BaseModel):
    text: str


class CloneResponse(BaseModel):
    voice_id: str


@router.post("/tts")
async def tts(req: TTSRequest) -> StreamingResponse:
    """Stream mp3 audio of `text` spoken in the chosen voice."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    try:
        audio_iter = synthesize(req.text, voice_id=req.voice_id)
    except VoiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return StreamingResponse(audio_iter, media_type="audio/mpeg")


@router.post("/stt", response_model=STTResponse)
async def stt(audio: UploadFile = File(...)) -> STTResponse:
    """Transcribe an uploaded audio clip via ElevenLabs Scribe."""
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio upload")
    try:
        text = await transcribe(data, filename=audio.filename or "audio.webm")
    except VoiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return STTResponse(text=text)


@router.post("/voice/clone", response_model=CloneResponse)
async def clone(
    name: str = Form(...),
    samples: list[UploadFile] = File(...),
) -> CloneResponse:
    """Create an instant-voice-cloned voice from one or more audio samples."""
    if not samples:
        raise HTTPException(status_code=400, detail="no samples provided")
    pairs: list[tuple[str, bytes]] = []
    for f in samples:
        data = await f.read()
        if data:
            pairs.append((f.filename or "sample.webm", data))
    if not pairs:
        raise HTTPException(status_code=400, detail="all samples were empty")
    try:
        voice_id = await clone_voice(pairs, name=name)
    except VoiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return CloneResponse(voice_id=voice_id)


@router.delete("/voice/{voice_id}", status_code=204)
async def delete(voice_id: str) -> None:
    """Best-effort delete of a cloned voice when a session ends."""
    try:
        await delete_voice(voice_id)
    except VoiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return None
