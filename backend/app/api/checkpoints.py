from fastapi import APIRouter, HTTPException

from app.models import Checkpoint

router = APIRouter()


@router.get("/{checkpoint_id}", response_model=Checkpoint)
async def get_checkpoint(checkpoint_id: str) -> Checkpoint:
    """TODO: load from mongo via checkpoint_repo."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/session/{session_id}", response_model=list[Checkpoint])
async def list_checkpoints(session_id: str) -> list[Checkpoint]:
    """TODO: list all checkpoints for a session, ordered by sim_date."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
