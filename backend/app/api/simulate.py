import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models import Profile, SimulationData
from app.services.orchestrator import stream_branched_simulation, stream_simulation

router = APIRouter()


@router.post("")
async def simulate_future_stream(profile: Profile) -> StreamingResponse:
    """Stream the multi-step simulation as NDJSON.

    Each line is a JSON object with a `phase` field:
      - {"phase": "counting", "agents": [...]}
      - {"phase": "plan", "outline": [...]}
      - {"phase": "event", "index": int, "checkpoint": {...}}
      - {"phase": "finalizing"}
      - {"phase": "complete", "simulation": <full SimulationData>}
      - {"phase": "error", "message": "..."}
    """
    return StreamingResponse(
        _ndjson(stream_simulation(profile)),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class BranchRequest(BaseModel):
    profile: Profile
    intervention_year: int
    intervention_text: str
    original_simulation: SimulationData


@router.post("/branch")
async def simulate_branch(req: BranchRequest) -> StreamingResponse:
    """Re-stream a simulation with a user intervention baked in.

    The intervention is the user's stated choice at a specific year. Pre-
    intervention checkpoints from the original simulation are PRESERVED
    (re-emitted as 'event' phases with their original indices). The planner
    walks ONLY the post-intervention years under the user's counterfactual.
    """
    intervention = {"year": req.intervention_year, "text": req.intervention_text}
    return StreamingResponse(
        _ndjson(
            stream_branched_simulation(
                req.profile,
                intervention=intervention,
                original_simulation=req.original_simulation,
            )
        ),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _ndjson(events: AsyncIterator[dict]) -> AsyncIterator[bytes]:
    async for ev in events:
        yield (json.dumps(ev) + "\n").encode("utf-8")
