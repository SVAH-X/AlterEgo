from app.models.profile import Profile
from app.prompts.orchestration import _mbti_block, _values_block


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
    assert "smaller life done well" in out.lower() or "smaller_well" in out.lower()


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
