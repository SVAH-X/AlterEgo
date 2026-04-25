from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class InterviewMessage(BaseModel):
    role: Literal["user", "future_self"]
    text: str
    audio_url: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class InterviewTurn(BaseModel):
    """One turn in the future-self interview, returned to the client."""

    text: str
    audio_url: Optional[str] = None
    grounded_in_checkpoint_ids: list[str] = Field(default_factory=list)
