"""Future-self interview — voiced (ElevenLabs) + text simultaneously.

Grounded in: full checkpoint history, social feed, user corrections,
branch assumptions, important relationships, final state.

Tone: warm, tired, honest. Not motivational. The future self knows what was
lost, what was kept, what was salvageable.
"""

from app.models import InterviewTurn


async def respond_as_future_self(
    session_id: str,
    user_text: str,
    voice: bool = True,
) -> InterviewTurn:
    """TODO:
    - load checkpoint ledger from mongo (vector search for relevant memories)
    - build grounded prompt with checkpoint summaries + corrections
    - call AgentRouter at FUTURE_SELF tier
    - if voice=True, synthesize via services.voice and return audio_url alongside text
    """
    raise NotImplementedError
