from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class CheckpointAction(str, Enum):
    CONTINUE = "continue"
    INTERRUPT = "interrupt"
    EDIT = "edit"
    BRANCH = "branch"


class CheckpointCard(BaseModel):
    """User-facing card surfaced during simulation."""

    time_jump_label: str
    triggering_event_title: str
    key_social_posts: list[str] = Field(default_factory=list)
    simulated_self_action: str
    consequences: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    available_actions: list[CheckpointAction] = Field(
        default_factory=lambda: [
            CheckpointAction.CONTINUE,
            CheckpointAction.INTERRUPT,
            CheckpointAction.EDIT,
            CheckpointAction.BRANCH,
        ]
    )


class Checkpoint(BaseModel):
    """Durable record of a single simulation checkpoint. Persisted to MongoDB."""

    checkpoint_id: str
    session_id: str
    parent_checkpoint_id: Optional[str] = None
    branch_label: str = "main"
    sim_date: date
    real_time: datetime = Field(default_factory=datetime.utcnow)

    triggering_event_id: Optional[str] = None
    interaction_log_ref: Optional[str] = None

    causal_summary: dict[str, Any] = Field(default_factory=dict)

    card: CheckpointCard
    user_corrections: list[str] = Field(default_factory=list)
