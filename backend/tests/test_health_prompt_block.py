from app.models.profile import Profile
from app.prompts.orchestration import (
    _health_block,
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_finalize_user,
    render_planning_user,
)
from app.models.orchestration import AgentSpec, OutlineEvent


def _profile(**overrides) -> Profile:
    base = {
        "name": "Sam", "age": 32, "occupation": "lawyer",
        "workHours": 60, "topGoal": "x", "topFear": "y",
        "targetYear": 2046, "presentYear": 2026,
    }
    base.update(overrides)
    return Profile(**base)


def _agent() -> AgentSpec:
    return AgentSpec(
        agent_id="user", role="user", name="Sam",
        relationship="the protagonist", voice="lived-in",
    )


def _outline_event() -> OutlineEvent:
    return OutlineEvent(
        year=2030, severity=0.5,
        primary_actors=["user"], visibility=["user"],
        hint="something",
    )


def test_health_block_empty_when_all_unset() -> None:
    assert _health_block(_profile()) == ""


def test_health_block_body_only() -> None:
    p = _profile(sleepHours="5-6", exerciseDays="1-2")
    out = _health_block(p)
    assert "Body:" in out
    assert "Mind:" not in out
    assert "5-6" in out
    assert "1-2" in out


def test_health_block_mind_only() -> None:
    p = _profile(stressLevel="high", moodBaseline="mixed")
    out = _health_block(p)
    assert "Mind:" in out
    assert "Body:" not in out
    assert "high" in out
    assert "mixed" in out


def test_health_block_full() -> None:
    p = _profile(
        sleepHours="6-7", exerciseDays="3-4",
        caffeineCups="2", alcoholDrinks="1-3",
        stressLevel="moderate", moodBaseline="mostly steady",
        lonelinessFrequency="rarely",
    )
    out = _health_block(p)
    assert "Body:" in out
    assert "Mind:" in out
    assert out.startswith("\n")  # inline-appendable like the other blocks


def test_counting_planning_detail_finalize_include_health_block() -> None:
    p = _profile(sleepHours="<5", stressLevel="severe")
    counting = render_counting_user(p)
    planning = render_planning_user(p, [_agent()], "state-block", "pool-block")
    branched = render_branched_planning_user(
        p, [_agent()], "state-block", "pool-block",
        intervention={"year": 2030, "text": "I quit"}, kept_block="(none)",
    )
    detail = render_detail_user(p, [_agent()], [_outline_event()], [], [_outline_event()])
    finalize = render_finalize_user(p, [_agent()], [])
    for out in (counting, planning, branched, detail, finalize):
        assert "Body:" in out
        assert "Mind:" in out
        assert "<5" in out
        assert "severe" in out


def test_counting_omits_health_when_unset() -> None:
    p = _profile()
    out = render_counting_user(p)
    assert "Health background" not in out
