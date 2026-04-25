"""Vector search — MongoDB Atlas Vector Search.

Used by the future-self interview to retrieve relevant checkpoints,
social posts, and corrections grounded in the simulated history.
"""


async def index_checkpoint_summary(checkpoint_id: str, text: str, embedding: list[float]) -> None:
    """TODO: upsert into a Mongo collection with a vector index."""
    raise NotImplementedError


async def query_relevant(session_id: str, query_embedding: list[float], k: int = 5) -> list[dict]:
    """TODO: $vectorSearch aggregation, scoped to session."""
    raise NotImplementedError
