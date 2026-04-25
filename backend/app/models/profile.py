from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


class IntakeProfile(BaseModel):
    """Structured profile from the intake form. Drives reality seed + agent graph."""

    name: str
    age: int = Field(ge=0, le=120)
    nationality: str
    current_country: str
    occupation: str
    industry: str
    work_pattern: str
    sleep_pattern: str
    financial_behavior: str
    short_term_goal: str
    long_term_goal: str
    self_description: str
    target_date: date

    things_i_would_never_do: list[str] = Field(default_factory=list)
    important_people: list[str] = Field(default_factory=list)
    known_life_facts: list[str] = Field(default_factory=list)

    journal_entries: list[str] = Field(default_factory=list)

    selfie_url: Optional[str] = None
    voice_clone_url: Optional[str] = None

    consent_realistic_predictions: bool = True
    tone: Literal["honest", "soft"] = "honest"
