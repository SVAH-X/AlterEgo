from pydantic import BaseModel, Field


class AgentSpec(BaseModel):
    """One agent in the user's life graph. Output of the counting step."""

    agent_id: str           # stable, snake_case (e.g. "manager", "sister_lena")
    role: str               # human label (e.g. "manager", "sister")
    name: str               # generated first name (or short label)
    relationship: str       # one sentence: how this agent relates to the user
    voice: str              # one short clause describing tone/style


class OutlineEvent(BaseModel):
    """One placeholder event from the planning step. Detail-fill writes the Checkpoint."""

    year: int
    severity: float = Field(ge=0.0, le=1.0)   # drives the time-scaler pulse
    primary_actors: list[str]                  # agent_ids
    visibility: list[str]                      # agent_ids who witness; "user" is implicit
    hint: str                                  # one-line teaser (planner's thought)


class Plan(BaseModel):
    agents: list[AgentSpec]
    outline: list[OutlineEvent]
