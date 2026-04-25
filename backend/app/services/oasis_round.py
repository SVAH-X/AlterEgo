"""OASIS round — inject an event into the social world and let agents react.

Wraps `camel-oasis` with our customizations from `oasis_ext/`.
At each checkpoint:
  1. inject event as a post or world-fact
  2. agents post / comment / like / ignore / amplify / misread / support
  3. user-agent reacts
  4. record interaction log + social feed for causal extractor
"""

from app.models import AgentCard, FutureEvent


async def run_round(
    agents: list[AgentCard],
    event: FutureEvent,
    sim_state: dict,
) -> dict:
    """TODO:
    - call camel-oasis via oasis_ext.checkpoint_orchestrator.run_round(...)
    - return interaction log + social feed snapshot
    """
    raise NotImplementedError
