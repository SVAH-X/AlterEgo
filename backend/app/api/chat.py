from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import ChatRequest, ChatResponse
from app.services.chat import ChatError, reply
from app.services.voice import VoiceError, synthesize

router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Free-form chat with the future self. Returns text only."""
    try:
        text = await reply(req)
    except ChatError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return ChatResponse(text=text)


@router.post("/voice")
async def chat_voice(req: ChatRequest) -> StreamingResponse:
    """Same as /chat but returns mp3 audio (ElevenLabs streaming)."""
    try:
        text = await reply(req)
    except ChatError as e:
        raise HTTPException(status_code=502, detail=str(e))

    try:
        audio_iter = synthesize(text, voice_id=req.voice_id)
    except VoiceError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return StreamingResponse(
        audio_iter,
        media_type="audio/mpeg",
        headers={"X-Reply-Text": text[:1024]},  # so the client can show the text alongside audio
    )
