"""Causal-hypothesis extractor — read OASIS interaction log, produce structured summary.

Output is a checkpoint summary: what happened, who influenced whom, what the
simulated self did, which assumptions mattered, what consequences followed,
what is still uncertain, what the user can edit.

"Causal" = simulated causal hypothesis inside the model world. NEVER claim
real-world proof, medical certainty, or financial certainty.
"""

from app.models import CheckpointCard


async def extract_causal_summary(interaction_log: dict) -> CheckpointCard:
    """TODO:
    - structured-output LLM call (causal-hypothesis extractor tier)
    - return CheckpointCard the UI can render
    """
    raise NotImplementedError
