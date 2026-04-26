from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


VALID_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
})

VALID_VALUES_DYADS: dict[str, frozenset[str]] = {
    "respected_liked": frozenset({"respected", "liked"}),
    "certainty_possibility": frozenset({"certainty", "possibility"}),
    "honest_kind": frozenset({"honest", "kind"}),
    "movement_roots": frozenset({"movement", "roots"}),
    "life_scope": frozenset({"smaller_well", "bigger_okay"}),
}

VALID_SLEEP_HOURS = frozenset({"<5", "5-6", "6-7", "7-8", "8+"})
VALID_EXERCISE_DAYS = frozenset({"0", "1-2", "3-4", "5+"})
VALID_CAFFEINE_CUPS = frozenset({"0", "1", "2", "3", "4+"})
VALID_ALCOHOL_DRINKS = frozenset({"0", "1-3", "4-7", "8-14", "15+"})
VALID_STRESS_LEVELS = frozenset({"low", "moderate", "high", "severe"})
VALID_MOOD_BASELINES = frozenset({"mostly low", "mixed", "mostly steady", "mostly positive"})
VALID_LONELINESS_FREQUENCIES = frozenset({"rarely", "sometimes", "often"})


def _allowed_or_none(allowed: frozenset[str]):
    """Build a 'before' validator that returns the value if it's a string in
    `allowed`, otherwise None. Mirrors the existing mbti/values pattern: bad
    input is dropped silently rather than rejected."""

    def _check(v):
        if v is None or not isinstance(v, str):
            return None
        v = v.strip()
        return v if v in allowed else None

    return _check


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

    # Body
    sleepHours: Optional[str] = None
    exerciseDays: Optional[str] = None
    caffeineCups: Optional[str] = None
    alcoholDrinks: Optional[str] = None
    # Mind
    stressLevel: Optional[str] = None
    moodBaseline: Optional[str] = None
    lonelinessFrequency: Optional[str] = None

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

    _normalize_sleep = field_validator("sleepHours", mode="before")(
        _allowed_or_none(VALID_SLEEP_HOURS)
    )
    _normalize_exercise = field_validator("exerciseDays", mode="before")(
        _allowed_or_none(VALID_EXERCISE_DAYS)
    )
    _normalize_caffeine = field_validator("caffeineCups", mode="before")(
        _allowed_or_none(VALID_CAFFEINE_CUPS)
    )
    _normalize_alcohol = field_validator("alcoholDrinks", mode="before")(
        _allowed_or_none(VALID_ALCOHOL_DRINKS)
    )
    _normalize_stress = field_validator("stressLevel", mode="before")(
        _allowed_or_none(VALID_STRESS_LEVELS)
    )
    _normalize_mood = field_validator("moodBaseline", mode="before")(
        _allowed_or_none(VALID_MOOD_BASELINES)
    )
    _normalize_loneliness = field_validator("lonelinessFrequency", mode="before")(
        _allowed_or_none(VALID_LONELINESS_FREQUENCIES)
    )
