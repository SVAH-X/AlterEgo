"""Causal-hypothesis ledger over OASIS interaction logs.

Reads who-posted-what, who-replied, who-amplified, who-ignored, and produces
a structured ledger of: what happened, who influenced whom, what the user
agent did, what assumptions held, what consequences followed, what is uncertain.

"Causal" here is always *simulated* causal hypothesis — never real-world claim.
"""


def extract_ledger(interaction_log: dict) -> dict:
    """TODO:
    - structured-output LLM call (causal-hypothesis extractor tier)
    - returns a dict the CheckpointCard can render directly
    """
    raise NotImplementedError
