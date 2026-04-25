"""Agent graph — instantiate a personalized OASIS social network for the user.

Each user gets: manager, 1-2 colleagues, close friend, family member,
industry voices, optional misinformation accounts. Character cards are
generated from intake.
"""

from app.models import AgentCard, IntakeProfile


async def build_agent_graph(profile: IntakeProfile) -> list[AgentCard]:
    """TODO:
    - infer realistic relationship graph from profile (occupation, industry, life stage)
    - generate character cards for each agent (values, style, biases, relationship)
    - assign tiers: high-signal vs peers vs noise
    - persist to mongo for resume support
    """
    raise NotImplementedError
