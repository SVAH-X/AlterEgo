"""Checkpoint orchestration over OASIS.

Vanilla OASIS runs continuously. We wrap it for discrete-event simulation:
jump to high-salience moments, run a full social round there, summarize drift
between, and expose pause / inspect / edit / resume.
"""


async def run_round(population: list[dict], event: dict, sim_state: dict) -> dict:
    """TODO:
    - inject `event` into the OASIS world (as post or world-fact)
    - tick OASIS forward enough rounds for the user-agent to see + react
    - capture interaction log + final social feed snapshot
    - return both for the causal extractor
    """
    raise NotImplementedError


def summarize_drift(sim_state: dict, days: int) -> dict:
    """TODO: condense quiet-period state changes without running full OASIS."""
    raise NotImplementedError
