from typing import Literal

from pydantic import BaseModel

Trajectory = Literal["high", "low"]


class AgedPortrait(BaseModel):
    """One aged portrait of the user at a specific year on a trajectory.

    `imageUrl` is a `data:image/png;base64,...` URL when generation
    succeeded, or `None` when generation failed (the UI degrades to the
    original selfie or text-only).
    """

    age: int
    year: int
    trajectory: Trajectory
    imageUrl: str | None = None
