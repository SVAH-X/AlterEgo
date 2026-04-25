"""Character card → system prompt rendering.

Takes an AgentCard and produces a system prompt for the OASIS round.
Personality comes from the structured card, not from hidden prompt chaos.
"""

from app.models import AgentCard


def render_character_system_prompt(card: AgentCard) -> str:
    """TODO: format the AgentCard into a system prompt."""
    raise NotImplementedError
