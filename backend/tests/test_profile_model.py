import pytest
from pydantic import ValidationError

from app.models.profile import Profile

DYAD_KEYS = {
    "respected_liked",
    "certainty_possibility",
    "honest_kind",
    "movement_roots",
    "life_scope",
}


def _base_profile_kwargs() -> dict:
    return {
        "name": "Sam",
        "age": 32,
        "occupation": "lawyer",
        "workHours": 60,
        "topGoal": "x",
        "topFear": "y",
        "targetYear": 2046,
        "presentYear": 2026,
    }


def test_profile_accepts_valid_values_dict() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={
            "respected_liked": "liked",
            "certainty_possibility": "possibility",
            "honest_kind": "kind",
            "movement_roots": "movement",
            "life_scope": "smaller_well",
        },
    )
    assert p.values is not None
    assert p.values["respected_liked"] == "liked"


def test_profile_drops_unknown_dyad_keys() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={
            "respected_liked": "liked",
            "bogus_key": "anything",
        },
    )
    assert p.values == {"respected_liked": "liked"}


def test_profile_drops_invalid_side_value() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={
            "respected_liked": "loved",  # not a valid side for this dyad
            "honest_kind": "kind",
        },
    )
    assert p.values == {"honest_kind": "kind"}


def test_profile_values_empty_after_filter_becomes_none() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={"bogus": "stuff"},
    )
    assert p.values is None


def test_profile_values_optional() -> None:
    p = Profile(**_base_profile_kwargs())
    assert p.values is None


def test_profile_mbti_still_optional() -> None:
    p = Profile(**_base_profile_kwargs(), mbti="INTJ")
    assert p.mbti == "INTJ"
    p2 = Profile(**_base_profile_kwargs(), mbti="not-a-type")
    assert p2.mbti is None  # invalid input normalizes to None
