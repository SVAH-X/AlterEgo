from fastapi import APIRouter, HTTPException

from app.models import Profile, SimulationData
from app.services.simulator import SimulationError, simulate

router = APIRouter()


@router.post("", response_model=SimulationData)
async def simulate_future(profile: Profile) -> SimulationData:
    """Generate a full SimulationData for the given Profile.

    One Claude call returns:
      - two precomputed twenty-year trajectories (high = current path, low = alternate)
      - a 25–50 word voiced opening line for the reveal screen
      - canned replies to three suggested questions

    Stateless. The frontend stores the response and uses it through all eight screens.
    """
    try:
        return await simulate(profile)
    except SimulationError as e:
        raise HTTPException(status_code=502, detail=str(e))
