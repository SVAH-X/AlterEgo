from app.models import SimulationData
from app.models.orchestration import AgentSpec
from app.models.profile import Profile


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def test_simulation_data_round_trips_with_agents() -> None:
    agent = AgentSpec(
        agent_id="manager", role="manager", name="Dana",
        relationship="line manager who shaped your early career",
        voice="clipped, transactional",
    )
    sim = SimulationData(
        profile=_profile(),
        agents=[agent],
        agedPortraits=[],
        checkpointsHigh=[],
        checkpointsLow=[],
        futureSelfOpening="hi",
        futureSelfReplies={"q": "a"},
    )
    raw = sim.model_dump_json()
    restored = SimulationData.model_validate_json(raw)
    assert restored.agents == [agent]


def test_simulation_data_defaults_agents_to_empty_list() -> None:
    sim = SimulationData(
        profile=_profile(),
        agedPortraits=[],
        checkpointsHigh=[],
        checkpointsLow=[],
        futureSelfOpening="hi",
        futureSelfReplies={"q": "a"},
    )
    assert sim.agents == []
