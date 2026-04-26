"""Health-aware deltas added to initial_state.

The body fields seed health_strain. The mind fields seed meaning_drift and
social_isolation, with chronic stress also pushing health_strain. When all
seven fields are None, behavior must be unchanged from the legacy formula.
"""
import pytest

from app.models.profile import Profile
from app.services.state_model import initial_state


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


def test_baseline_unchanged_when_health_fields_absent() -> None:
    p = _profile()
    s = initial_state(p)
    # Match the legacy formula exactly: 0.2 + (60-40)/30 * 0.3 + (32-25)*0.005.
    expected = 0.2 + (20 / 30) * 0.3 + 7 * 0.005
    assert s.health_strain == pytest.approx(expected, abs=1e-6)


def test_severe_sleep_loss_raises_health_strain() -> None:
    base = initial_state(_profile()).health_strain
    s = initial_state(_profile(sleepHours="<5"))
    assert s.health_strain == pytest.approx(min(1.0, base + 0.15), abs=1e-6)


def test_full_sleep_lowers_health_strain() -> None:
    base = initial_state(_profile()).health_strain
    s = initial_state(_profile(sleepHours="7-8"))
    assert s.health_strain == pytest.approx(max(0.0, base - 0.05), abs=1e-6)


def test_zero_exercise_raises_strain() -> None:
    base = initial_state(_profile()).health_strain
    s = initial_state(_profile(exerciseDays="0"))
    assert s.health_strain == pytest.approx(min(1.0, base + 0.08), abs=1e-6)


def test_high_alcohol_raises_strain() -> None:
    base = initial_state(_profile()).health_strain
    s = initial_state(_profile(alcoholDrinks="15+"))
    assert s.health_strain == pytest.approx(min(1.0, base + 0.12), abs=1e-6)


def test_severe_stress_pushes_meaning_and_health() -> None:
    baseline = initial_state(_profile())
    s = initial_state(_profile(stressLevel="severe"))
    assert s.meaning_drift == pytest.approx(min(1.0, baseline.meaning_drift + 0.15), abs=1e-6)
    assert s.health_strain == pytest.approx(min(1.0, baseline.health_strain + 0.10), abs=1e-6)


def test_low_mood_pushes_meaning_drift() -> None:
    baseline = initial_state(_profile())
    s = initial_state(_profile(moodBaseline="mostly low"))
    assert s.meaning_drift == pytest.approx(min(1.0, baseline.meaning_drift + 0.12), abs=1e-6)


def test_positive_mood_relieves_meaning_drift() -> None:
    baseline = initial_state(_profile())
    s = initial_state(_profile(moodBaseline="mostly positive"))
    assert s.meaning_drift == pytest.approx(max(0.0, baseline.meaning_drift - 0.05), abs=1e-6)


def test_often_lonely_raises_social_isolation() -> None:
    baseline = initial_state(_profile())
    s = initial_state(_profile(lonelinessFrequency="often"))
    assert s.social_isolation == pytest.approx(min(1.0, baseline.social_isolation + 0.15), abs=1e-6)


def test_aspects_clamped_to_unit_interval() -> None:
    s = initial_state(_profile(
        workHours=120,
        sleepHours="<5",
        alcoholDrinks="15+",
        stressLevel="severe",
        moodBaseline="mostly low",
        lonelinessFrequency="often",
    ))
    assert 0.0 <= s.health_strain <= 1.0
    assert 0.0 <= s.meaning_drift <= 1.0
    assert 0.0 <= s.social_isolation <= 1.0
