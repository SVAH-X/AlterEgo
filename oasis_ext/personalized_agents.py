"""Personalized agent instantiation for OASIS.

Builds a profile-driven OASIS population (manager, colleagues, friend, family,
industry voices, optional misinformation accounts) from the user's IntakeProfile.
"""


def build_population(profile: dict, agent_cards: list[dict]) -> list[dict]:
    """TODO:
    - translate AgentCards into camel-oasis agent definitions
    - attach character cards to each agent's system prompt
    - return a list ready to hand to the OASIS environment constructor
    """
    raise NotImplementedError
