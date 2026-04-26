from pydantic import BaseModel, Field

from app.models.checkpoint import Checkpoint
from app.models.orchestration import AgentSpec
from app.models.portrait import AgedPortrait
from app.models.profile import Profile


class SimulationData(BaseModel):
    """Mirrors frontend `src/types.ts` SimulationData exactly.

    The single object returned by POST /simulate. The frontend stores it and
    drives all eight screens from this payload.
    """

    profile: Profile
    agents: list[AgentSpec] = Field(default_factory=list)   # cast of agents in the user's life
    agedPortraits: list[AgedPortrait]            # up to 5 entries (high trajectory)
    checkpointsHigh: list[Checkpoint]            # current-trajectory path
    futureSelfOpening: str                       # voiced reveal line
    futureSelfReplies: dict[str, str]            # 3 canned Q→A pairs
