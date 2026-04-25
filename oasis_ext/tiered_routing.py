"""Tiered model routing per OASIS agent.

Bridges OASIS's per-agent inference call into AlterEgo's AgentRouter so each
agent uses the model tier its character card specifies.
"""


def make_oasis_inference_callback(router):
    """TODO:
    - return a callable that camel-oasis can use as its inference hook
    - the callable takes (agent_id, messages, ...) and dispatches to router.complete()
      with the tier resolved from the agent's character card
    """
    raise NotImplementedError
