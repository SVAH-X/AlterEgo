from typing import Optional

from pydantic import BaseModel, Field

from app.models.checkpoint import Checkpoint
from app.models.clinical import ClinicalSummary
from app.models.orchestration import AgentSpec
from app.models.portrait import AgedPortrait
from app.models.profile import Profile


class SimulationData(BaseModel):
    """Mirrors frontend `src/types.ts` SimulationData exactly.

    The single object returned by POST /simulate. The frontend stores it and
    drives all eight screens from this payload.
    """

    profile: Profile
    agents: list[AgentSpec] = Field(default_factory=list)
    agedPortraits: list[AgedPortrait] = []
    checkpointsHigh: list[Checkpoint]
    futureSelfOpening: str
    futureSelfReplies: dict[str, str]
    clinicalSummary: Optional[ClinicalSummary] = None
