"""Session persistence — MongoDB Atlas.

Stores the user profile, agent graph, reality seed, and pointer to the
current checkpoint. One document per session.
"""

from app.models import IntakeProfile


async def create_session(session_id: str, profile: IntakeProfile) -> None:
    """TODO: insert session doc."""
    raise NotImplementedError


async def get_session(session_id: str) -> dict | None:
    """TODO: load session doc."""
    raise NotImplementedError
