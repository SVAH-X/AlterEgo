from app.models.profile import Profile
from app.models.orchestration import AgentSpec, OutlineEvent
from app.prompts.orchestration import (
    _mbti_block,
    _values_block,
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_planning_user,
)


def _profile(**overrides) -> Profile:
    base = {
        "name": "Sam",
        "age": 32,
        "occupation": "lawyer",
        "workHours": 60,
        "topGoal": "x",
        "topFear": "y",
        "targetYear": 2046,
        "presentYear": 2026,
    }
    base.update(overrides)
    return Profile(**base)


def test_mbti_block_present() -> None:
    p = _profile(mbti="INTJ")
    out = _mbti_block(p)
    assert "INTJ" in out
    assert out.startswith("\n")  # block is meant to inline-append to a list


def test_mbti_block_absent_when_unset() -> None:
    p = _profile()
    assert _mbti_block(p) == ""


def test_values_block_renders_chosen_sides() -> None:
    p = _profile(values={
        "respected_liked": "liked",
        "certainty_possibility": "possibility",
        "honest_kind": "kind",
        "movement_roots": "movement",
        "life_scope": "smaller_well",
    })
    out = _values_block(p)
    # Loose contract: must mention each chosen side word and frame as "X over Y".
    assert "liked" in out.lower() and "respected" in out.lower()
    assert "over" in out.lower()
    assert "smaller life done well" in out.lower()


def test_values_block_partial_input_renders_only_present() -> None:
    p = _profile(values={"honest_kind": "kind"})
    out = _values_block(p)
    assert "kind" in out.lower() and "honest" in out.lower()
    # No mention of any other dyad's side words.
    assert "liked" not in out.lower()
    assert "possibility" not in out.lower()


def test_values_block_absent_when_unset() -> None:
    p = _profile()
    assert _values_block(p) == ""


def _agent() -> AgentSpec:
    return AgentSpec(
        agent_id="user", role="user", name="Sam",
        relationship="the protagonist", voice="lived-in",
    )


def _outline_event() -> OutlineEvent:
    return OutlineEvent(
        year=2030, severity=0.5,
        primary_actors=["user"], visibility=["user"],
        hint="something happens",
    )


def test_counting_user_includes_mbti_and_values_when_present() -> None:
    p = _profile(mbti="INTJ", values={"honest_kind": "kind"})
    out = render_counting_user(p)
    assert "INTJ" in out
    assert "values (forced-choice)" in out
    assert "KIND over honest" in out


def test_counting_user_omits_personality_when_absent() -> None:
    p = _profile()
    out = render_counting_user(p)
    assert "MBTI" not in out
    assert "values (forced-choice)" not in out


def test_planning_user_includes_values() -> None:
    p = _profile(mbti="INTJ", values={"movement_roots": "movement"})
    out = render_planning_user(p, [_agent()], "state-block", "pool-block")
    assert "INTJ" in out
    assert "MOVEMENT over roots" in out


def test_branched_planning_user_includes_values() -> None:
    p = _profile(mbti="ENFP", values={"certainty_possibility": "possibility"})
    out = render_branched_planning_user(
        p, [_agent()], "state-block", "pool-block",
        intervention={"year": 2030, "text": "I quit"},
        kept_block="(none)",
    )
    assert "ENFP" in out
    assert "POSSIBILITY over certainty" in out


def test_detail_user_includes_mbti_and_values() -> None:
    p = _profile(mbti="ISTP", values={"life_scope": "smaller_well"})
    out = render_detail_user(
        p, [_agent()], [_outline_event()], [], [_outline_event()]
    )
    assert "ISTP" in out
    assert "smaller life done well" in out.lower()
