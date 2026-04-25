from enum import Enum

from pydantic import BaseModel, Field


class AgentTier(str, Enum):
    FUTURE_SELF = "future_self"
    HIGH_SIGNAL = "high_signal"
    PEERS = "peers"
    NOISE = "noise"


class AgentCard(BaseModel):
    """Per-agent character spec. Drives behavior in OASIS rounds and the interview."""

    agent_id: str
    role: str
    name: str
    tier: AgentTier
    relationship_to_user: str
    values: list[str] = Field(default_factory=list)
    communication_style: str
    biases: list[str] = Field(default_factory=list)
    vulnerability_to_user: str = ""
    notes: str = ""
