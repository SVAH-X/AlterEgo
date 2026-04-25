from typing import Optional

from pydantic import BaseModel, Field, field_validator


VALID_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
})


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
    mbti: Optional[str] = None

    @field_validator("mbti", mode="before")
    @classmethod
    def _normalize_mbti(cls, v):
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        v = v.strip().upper()
        if not v:
            return None
        return v if v in VALID_MBTI else None
