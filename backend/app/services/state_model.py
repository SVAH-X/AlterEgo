"""State-aspect model for event triggering.

Each life trajectory carries a small state vector that evolves year by year.
Events in the pool fire when their tolerance triggers cross. The planner walks
the simulation in its head, but the *initial state* and the drift rules below
are deterministic — we compute and pass them in so the model isn't left to
invent the math.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.models.profile import Profile

Aspect = Literal[
    "work_intensity",
    "financial_pressure",
    "social_isolation",
    "family_distance",
    "health_strain",
    "career_momentum",
    "meaning_drift",
    "relationship_strain",
]

ASPECTS: tuple[Aspect, ...] = (
    "work_intensity",
    "financial_pressure",
    "social_isolation",
    "family_distance",
    "health_strain",
    "career_momentum",
    "meaning_drift",
    "relationship_strain",
)


class State(BaseModel):
    """Aspect → 0.0..1.0 value. Higher means more pressure on that dimension."""

    work_intensity: float = 0.0
    financial_pressure: float = 0.4
    social_isolation: float = 0.3
    family_distance: float = 0.3
    health_strain: float = 0.2
    career_momentum: float = 0.6
    meaning_drift: float = 0.2
    relationship_strain: float = 0.3


def initial_state(profile: Profile) -> State:
    """Compute the starting state vector deterministically from the intake.

    These values are the seed; the planner walks them forward year-by-year using
    the drift rules described in `DRIFT_RULES_BLOCK` and the `state_impact` of
    each fired event.
    """
    work_intensity = _clamp(profile.workHours / 100.0)

    # Health strain: scaling with overwork plus a small age baseline.
    overwork = max(0.0, profile.workHours - 40) / 30.0
    age_baseline = max(0.0, profile.age - 25) * 0.005
    health_strain = 0.2 + overwork * 0.3 + age_baseline

    # Financial pressure: defaults moderate; topFear mentioning money raises it.
    fear_lower = profile.topFear.lower()
    money_words = ("money", "broke", "afford", "savings", "rent", "debt", "income")
    financial_pressure = 0.4 + (0.15 if any(w in fear_lower for w in money_words) else 0.0)

    # Career momentum: starts mid; goal mentioning ambition raises it slightly.
    goal_lower = profile.topGoal.lower()
    momentum_words = ("build", "create", "ship", "launch", "lead", "founder", "own")
    career_momentum = 0.6 + (0.08 if any(w in goal_lower for w in momentum_words) else 0.0)

    # Meaning drift: rises if the goal sounds aspirational AND work hours are high
    # (high gap between aspiration and execution).
    meaning_drift = 0.2
    if any(w in goal_lower for w in momentum_words) and profile.workHours > 55:
        meaning_drift = 0.35

    # Social isolation: rises with work intensity.
    social_isolation = 0.3 + max(0.0, work_intensity - 0.6) * 0.3

    health_strain += _SLEEP_HEALTH_DELTA.get(profile.sleepHours, 0.0)
    health_strain += _EXERCISE_HEALTH_DELTA.get(profile.exerciseDays, 0.0)
    health_strain += _CAFFEINE_HEALTH_DELTA.get(profile.caffeineCups, 0.0)
    health_strain += _ALCOHOL_HEALTH_DELTA.get(profile.alcoholDrinks, 0.0)

    meaning_drift += _STRESS_MEANING_DELTA.get(profile.stressLevel, 0.0)
    health_strain += _STRESS_HEALTH_DELTA.get(profile.stressLevel, 0.0)
    meaning_drift += _MOOD_MEANING_DELTA.get(profile.moodBaseline, 0.0)
    social_isolation += _LONELINESS_SOCIAL_DELTA.get(profile.lonelinessFrequency, 0.0)

    return State(
        work_intensity=work_intensity,
        financial_pressure=_clamp(financial_pressure),
        social_isolation=_clamp(social_isolation),
        family_distance=0.3,
        health_strain=_clamp(health_strain),
        career_momentum=_clamp(career_momentum),
        meaning_drift=_clamp(meaning_drift),
        relationship_strain=0.3,
    )


# Health-intake delta lookup tables.
_SLEEP_HEALTH_DELTA: dict[str | None, float] = {
    "<5": 0.15, "5-6": 0.08, "6-7": 0.02, "7-8": -0.05, "8+": -0.03,
}
_EXERCISE_HEALTH_DELTA: dict[str | None, float] = {
    "0": 0.08, "1-2": 0.02, "3-4": -0.05, "5+": -0.10,
}
_CAFFEINE_HEALTH_DELTA: dict[str | None, float] = {
    "3": 0.02, "4+": 0.05,
}
_ALCOHOL_HEALTH_DELTA: dict[str | None, float] = {
    "4-7": 0.02, "8-14": 0.05, "15+": 0.12,
}
_STRESS_MEANING_DELTA: dict[str | None, float] = {
    "moderate": 0.03, "high": 0.08, "severe": 0.15,
}
_STRESS_HEALTH_DELTA: dict[str | None, float] = {
    "high": 0.05, "severe": 0.10,
}
_MOOD_MEANING_DELTA: dict[str | None, float] = {
    "mostly low": 0.12, "mixed": 0.05, "mostly positive": -0.05,
}
_LONELINESS_SOCIAL_DELTA: dict[str | None, float] = {
    "sometimes": 0.05, "often": 0.15,
}


DRIFT_RULES_BLOCK = """\
# State drift (apply once per simulated year, BEFORE checking event triggers)

- work_intensity      drifts toward profile.workHours/100, ± 0.02 noise
- health_strain       += 0.02 + max(0, work_intensity - 0.5) * 0.05
- social_isolation    += 0.05 if work_intensity > 0.7 else 0.01
- family_distance     += 0.03 (decay slightly when an event resets it)
- career_momentum     += 0.01 in early career, drifts to 0.5 by age 50
- meaning_drift       += 0.02 if work_intensity > 0.6 AND career_momentum < 0.6
- financial_pressure  drifts toward whatever recent events have done to it
- relationship_strain depends on most-recent partner event; default += 0.01

After applying drift AND any event's `state_impact`, clamp each aspect to [0, 1].
"""


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
