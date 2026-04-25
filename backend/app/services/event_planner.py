"""Event planner — generate candidate future events for a profile.

Categories: macro, industry, social, personal, endogenous.
Each event carries: title, rationale, time window, uncertainty,
expected impact, affected agents, assumptions, source.
"""

from app.models import FutureEvent, IntakeProfile


async def plan_events(profile: IntakeProfile, reality_seed: dict) -> list[FutureEvent]:
    """TODO:
    - sample from scenario library (scripts/seed_world_events.py)
    - extend with profile-specific events via LLM (causal extractor tier)
    - score by relevance + uncertainty + expected impact
    """
    raise NotImplementedError
