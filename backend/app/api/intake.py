from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel

from app.models import IntakeProfile

router = APIRouter()


class IntakeResponse(BaseModel):
    session_id: str


@router.post("", response_model=IntakeResponse)
async def submit_intake(profile: IntakeProfile) -> IntakeResponse:
    """Accept the user profile and create a simulation session.

    TODO:
    - persist to mongo (sessions collection)
    - kick off reality_seed + agent_graph
    """
    session_id = str(uuid4())
    return IntakeResponse(session_id=session_id)
