"""Checkpoint scheduler — discrete-event simulation, not month-by-month brute force.

Picks the next checkpoint based on event salience, user vulnerability,
expected impact, uncertainty, and time since last meaningful checkpoint.
Quiet stretches summarize as drift; high-impact periods get full OASIS rounds.
"""

from datetime import date

from app.models import FutureEvent


async def next_checkpoint_date(
    current_sim_date: date,
    target_date: date,
    pending_events: list[FutureEvent],
    last_checkpoint_date: date,
) -> date | None:
    """TODO: implement discrete-event scheduling.

    Returns the date of the next checkpoint, or None if simulation is done.
    """
    raise NotImplementedError
