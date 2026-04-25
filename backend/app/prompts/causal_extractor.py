"""Structured-output prompt for the causal-hypothesis extractor.

Reads OASIS interaction logs, returns a CheckpointCard. Strict JSON output.
"Causal" = simulated causal hypothesis inside the model world.
"""


def render_causal_extractor_prompt(interaction_log: dict) -> str:
    """TODO: render extractor prompt with strict JSON schema."""
    raise NotImplementedError
