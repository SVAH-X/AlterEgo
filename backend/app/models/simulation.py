from pydantic import BaseModel

from app.models.checkpoint import Checkpoint
from app.models.portrait import AgedPortrait
from app.models.profile import Profile


class SimulationData(BaseModel):
    """Mirrors frontend `src/types.ts` SimulationData exactly.

    The single object returned by POST /simulate. The frontend stores it and
    drives all eight screens from this payload.
    """

    profile: Profile
    # Defaults to [] so chat-only paths (e.g. the Fetch.ai agent, which has
    # no selfie pipeline) can ground replies without supplying portraits.
    agedPortraits: list[AgedPortrait] = []        # 10 entries on web: 5 high + 5 low
    checkpointsHigh: list[Checkpoint]            # current-trajectory path (6 cards)
    checkpointsLow: list[Checkpoint]             # alternate-hours path (6 cards)
    futureSelfOpening: str                       # 25–50 word voiced reveal line
    futureSelfReplies: dict[str, str]            # 3 canned Q→A pairs
