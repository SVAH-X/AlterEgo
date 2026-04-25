"""Checkpoint ledger persistence — MongoDB Atlas.

Collection: `checkpoints`. Documents are nested (event, social posts,
causal summary, corrections) — natural fit for Mongo.
"""

from app.db.client import get_db
from app.models import Checkpoint


async def insert(checkpoint: Checkpoint) -> None:
    """TODO: insert checkpoint document."""
    raise NotImplementedError


async def find_by_id(checkpoint_id: str) -> Checkpoint | None:
    """TODO: load by checkpoint_id."""
    raise NotImplementedError


async def list_for_session(session_id: str) -> list[Checkpoint]:
    """TODO: list all checkpoints for a session, ordered by sim_date."""
    raise NotImplementedError
