from typing import Literal

from pydantic import BaseModel

Tone = Literal["neutral", "warn", "good"]


class Checkpoint(BaseModel):
    """Mirrors frontend `src/types.ts` Checkpoint exactly.

    `tone` defaults to "neutral" when the model omits it — the wire shape
    always carries it.
    """

    year: int
    age: int
    title: str
    event: str
    did: str
    consequence: str
    tone: Tone = "neutral"
