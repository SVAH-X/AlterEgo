from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import InterviewTurn

router = APIRouter()


class InterviewRequest(BaseModel):
    session_id: str
    user_text: str
    voice: bool = True


@router.post("", response_model=InterviewTurn)
async def interview_future_self(req: InterviewRequest) -> InterviewTurn:
    """Talk to the simulated future self. Voice + text.

    TODO:
    - load full simulation memory (checkpoint ledger + corrections)
    - call AgentRouter at FUTURE_SELF tier with grounding
    - if voice=True, stream ElevenLabs synthesis alongside text
    """
    raise HTTPException(status_code=501, detail="Not implemented yet")
