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


def test_profile_accepts_valid_health_fields() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        sleepHours="6-7",
        exerciseDays="3-4",
        caffeineCups="2",
        alcoholDrinks="1-3",
        stressLevel="high",
        moodBaseline="mixed",
        lonelinessFrequency="sometimes",
    )
    assert p.sleepHours == "6-7"
    assert p.exerciseDays == "3-4"
    assert p.caffeineCups == "2"
    assert p.alcoholDrinks == "1-3"
    assert p.stressLevel == "high"
    assert p.moodBaseline == "mixed"
    assert p.lonelinessFrequency == "sometimes"


def test_profile_health_fields_default_none() -> None:
    p = Profile(**_base_profile_kwargs())
    assert p.sleepHours is None
    assert p.exerciseDays is None
    assert p.caffeineCups is None
    assert p.alcoholDrinks is None
    assert p.stressLevel is None
    assert p.moodBaseline is None
    assert p.lonelinessFrequency is None


def test_profile_drops_invalid_health_field_values() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        sleepHours="forever",     # bogus
        exerciseDays="3-4",       # valid
        caffeineCups="seventeen", # bogus
        stressLevel="meh",        # bogus
        moodBaseline="mostly steady",  # valid
        lonelinessFrequency="always",  # bogus
    )
    assert p.sleepHours is None
    assert p.exerciseDays == "3-4"
    assert p.caffeineCups is None
    assert p.stressLevel is None
    assert p.moodBaseline == "mostly steady"
    assert p.lonelinessFrequency is None


def test_profile_health_fields_drop_non_string() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        sleepHours=7,        # not a string
        exerciseDays=None,
        stressLevel=False,
    )
    assert p.sleepHours is None
    assert p.exerciseDays is None
    assert p.stressLevel is None
