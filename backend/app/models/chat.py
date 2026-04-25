from typing import Literal

from pydantic import BaseModel

from app.models.profile import Profile
from app.models.simulation import SimulationData


class ChatMessage(BaseModel):
    role: Literal["user", "future"]
    text: str


class ChatRequest(BaseModel):
    """Free-form follow-up chat. Stateless — the frontend sends the full history each call.

    `simulation` is the SimulationData returned by /simulate, used to ground the
    future-self voice in the trajectories the user has already seen.
    """

    profile: Profile
    simulation: SimulationData
    history: list[ChatMessage]
    user_text: str


class ChatResponse(BaseModel):
    text: str
