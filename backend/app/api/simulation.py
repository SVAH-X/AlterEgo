from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import CheckpointCard

router = APIRouter()


class StartSimulationRequest(BaseModel):
    session_id: str


class StartSimulationResponse(BaseModel):
    session_id: str
    next_checkpoint: CheckpointCard | None = None


class ResumeRequest(BaseModel):
    session_id: str
    checkpoint_id: str
    user_corrections: list[str] = []


class BranchRequest(BaseModel):
    session_id: str
    from_checkpoint_id: str
    branch_label: str
    edit_description: str


@router.post("/start", response_model=StartSimulationResponse)
async def start_simulation(req: StartSimulationRequest) -> StartSimulationResponse:
    """TODO: build reality seed -> agent graph -> first checkpoint."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/resume", response_model=StartSimulationResponse)
async def resume_simulation(req: ResumeRequest) -> StartSimulationResponse:
    """TODO: apply corrections to agent state, run scheduler to next checkpoint."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/branch", response_model=StartSimulationResponse)
async def branch_simulation(req: BranchRequest) -> StartSimulationResponse:
    """TODO: fork from given checkpoint with edit applied."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
