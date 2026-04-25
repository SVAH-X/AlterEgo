from pydantic import BaseModel, Field


class Profile(BaseModel):
    """Mirrors frontend `src/types.ts` Profile exactly. Field names are camelCase
    on the wire to match the TS contract; we keep them as Python attributes too."""

    model_config = {"populate_by_name": True}

    name: str
    age: int = Field(ge=0, le=120)
    occupation: str
    workHours: int = Field(ge=0, le=168)
    topGoal: str
    topFear: str
    targetYear: int
    presentYear: int
