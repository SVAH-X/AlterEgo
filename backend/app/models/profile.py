from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


VALID_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
})

# Allowed sides for each dyad slug. The keys here are the canonical dyad
# identifiers; values are the two sides the user can pick. Anything else is
# dropped by the validator below.
VALID_VALUES_DYADS: dict[str, frozenset[str]] = {
    "respected_liked": frozenset({"respected", "liked"}),
    "certainty_possibility": frozenset({"certainty", "possibility"}),
    "honest_kind": frozenset({"honest", "kind"}),
    "movement_roots": frozenset({"movement", "roots"}),
    "life_scope": frozenset({"smaller_well", "bigger_okay"}),
}


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
    values: Optional[Dict[str, str]] = None

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

    @field_validator("values", mode="before")
    @classmethod
    def _normalize_values(cls, v):
        if v is None:
            return None
        if not isinstance(v, dict):
            return None
        cleaned: dict[str, str] = {}
        for key, side in v.items():
            if not isinstance(key, str) or not isinstance(side, str):
                continue
            allowed = VALID_VALUES_DYADS.get(key)
            if allowed and side in allowed:
                cleaned[key] = side
        return cleaned or None
