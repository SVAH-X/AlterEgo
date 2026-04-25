"""Load and filter the event pool for the planner.

The pool is a JSON file of pre-curated events. Each entry has tolerance triggers
on the state aspects — events fire when the simulation's running state crosses
*any one* of their thresholds. This service:
  1. Loads the JSON at module import.
  2. Filters by the profile's year horizon (events whose year_window overlaps).
  3. Formats the surviving events for the planner prompt.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.models.profile import Profile

POOL_PATH = Path(__file__).parent.parent / "data" / "event_pool.json"


class Trigger(BaseModel):
    aspect: str
    op: Literal[">=", "<="]
    threshold: float = Field(ge=0.0, le=1.0)


class PoolEvent(BaseModel):
    id: str
    title: str
    summary: str
    category: str
    year_window: tuple[int, int]
    severity_baseline: float = Field(ge=0.0, le=1.0)
    triggers: list[Trigger]
    state_impact: dict[str, float] = Field(default_factory=dict)


@lru_cache
def load_pool() -> list[PoolEvent]:
    with POOL_PATH.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    return [PoolEvent.model_validate(item) for item in raw]


def filter_pool(profile: Profile) -> list[PoolEvent]:
    """Return events whose year_window overlaps the simulation horizon."""
    horizon_lo, horizon_hi = profile.presentYear, profile.targetYear
    pool = load_pool()
    return [
        e
        for e in pool
        if e.year_window[0] <= horizon_hi and e.year_window[1] >= horizon_lo
    ]


def format_pool_for_prompt(events: list[PoolEvent]) -> str:
    """Render the filtered pool as a block to append to the planner system prompt."""
    if not events:
        return "(no curated events apply to this horizon — generate organic ones only)"
    lines = []
    for e in events:
        triggers = ", ".join(
            f"{t.aspect} {t.op} {t.threshold:.2f}" for t in e.triggers
        )
        impact = ", ".join(f"{k} {v:+.2f}" for k, v in e.state_impact.items())
        lines.append(
            f"- id: {e.id}\n"
            f"  title: {e.title}\n"
            f"  summary: {e.summary}\n"
            f"  window: {e.year_window[0]}–{e.year_window[1]} | severity≈{e.severity_baseline:.2f}\n"
            f"  triggers (any one arms it): {triggers}\n"
            f"  state_impact when it fires: {impact}"
        )
    return "\n\n".join(lines)
