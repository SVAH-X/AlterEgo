# Health Intake & Clinical Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional health intake step (body + mind) and surface a clinical-summary card on the reveal screen, additively, without changing existing flow or tone.

**Architecture:** Frontend gets a new `health` screen between intake and processing capturing seven optional bucketed fields. Backend extends `Profile` with those fields, seeds health/meaning/social aspects of `state_model` from them, includes a `_health_block` in all four orchestration prompts, and generates a new `ClinicalSummary` at the end of the `finalizing` phase that ships in the `complete` payload. Reveal screen renders portrait+quote on the left and a new `ClinicalCard` on the right at desktop, stacking at narrower widths.

**Tech Stack:** Python 3 / FastAPI / Pydantic v2 / pytest (backend); Vite / React 18 / TypeScript (frontend). Inline styles with `var()` tokens. Anthropic SDK via the existing `AgentRouter`.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `backend/app/models/profile.py` | Pydantic `Profile` with optional health fields and validators | Modify |
| `backend/app/models/clinical.py` | `ClinicalSummary`, `ClinicalRiskFactor`, `HealthState` types | **Create** |
| `backend/app/models/simulation.py` | Add `clinicalSummary: Optional[ClinicalSummary]` to `SimulationData` | Modify |
| `backend/app/models/__init__.py` | Re-export new types | Modify |
| `backend/app/services/state_model.py` | Apply body + mind deltas in `initial_state()` | Modify |
| `backend/app/prompts/orchestration.py` | `_health_block`, prompt injection, `CLINICAL_SUMMARY_SYSTEM`, `render_clinical_user` | Modify |
| `backend/app/services/orchestrator.py` | Run clinical-summary call in `finalizing`, attach to payload | Modify |
| `backend/tests/test_profile_model.py` | Tests for new health-field validators | Modify |
| `backend/tests/test_state_model_health.py` | Tests for health/meaning/social deltas | **Create** |
| `backend/tests/test_health_prompt_block.py` | Tests for `_health_block` and injection | **Create** |
| `backend/tests/test_clinical_prompt.py` | Tests for `render_clinical_user` and the clinical-summary parsing helper | **Create** |
| `frontend/src/types.ts` | Profile health fields, `ClinicalSummary` types, optional field on `SimulationData` | Modify |
| `frontend/src/screens/screens-a.tsx` | New `ScreenHealth` and modified `ScreenReveal` (+ `ClinicalCard`) | Modify |
| `frontend/src/App.tsx` | Insert `health` entry between `intake` and `processing` | Modify |

---

## Task 1: Profile health fields (backend)

**Files:**
- Modify: `backend/app/models/profile.py`
- Test: `backend/tests/test_profile_model.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_profile_model.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_profile_model.py -v`
Expected: FAIL — fields don't exist on `Profile`.

- [ ] **Step 3: Implement Profile changes**

Replace the entire body of `backend/app/models/profile.py` with:

```python
from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


VALID_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
})

VALID_VALUES_DYADS: dict[str, frozenset[str]] = {
    "respected_liked": frozenset({"respected", "liked"}),
    "certainty_possibility": frozenset({"certainty", "possibility"}),
    "honest_kind": frozenset({"honest", "kind"}),
    "movement_roots": frozenset({"movement", "roots"}),
    "life_scope": frozenset({"smaller_well", "bigger_okay"}),
}

VALID_SLEEP_HOURS = frozenset({"<5", "5-6", "6-7", "7-8", "8+"})
VALID_EXERCISE_DAYS = frozenset({"0", "1-2", "3-4", "5+"})
VALID_CAFFEINE_CUPS = frozenset({"0", "1", "2", "3", "4+"})
VALID_ALCOHOL_DRINKS = frozenset({"0", "1-3", "4-7", "8-14", "15+"})
VALID_STRESS_LEVELS = frozenset({"low", "moderate", "high", "severe"})
VALID_MOOD_BASELINES = frozenset({"mostly low", "mixed", "mostly steady", "mostly positive"})
VALID_LONELINESS_FREQUENCIES = frozenset({"rarely", "sometimes", "often"})


def _allowed_or_none(allowed: frozenset[str]):
    """Build a 'before' validator that returns the value if it's a string in
    `allowed`, otherwise None. Mirrors the existing mbti/values pattern: bad
    input is dropped silently rather than rejected."""

    def _check(v):
        if v is None or not isinstance(v, str):
            return None
        v = v.strip()
        return v if v in allowed else None

    return _check


class Profile(BaseModel):
    """Mirrors frontend `src/types.ts` Profile exactly. Field names are camelCase
    on the wire to match the TS contract; we keep them as Python attributes too."""

    model_config = {"populate_by_name": True}

    name: str
    age: int = Field(ge=0, le=120)
    occupation: str
    workHours: int = Field(ge=0, le=168)
    topGoal: str
    topFear: str
    targetYear: int
    presentYear: int
    mbti: Optional[str] = None
    values: Optional[Dict[str, str]] = None

    # Body
    sleepHours: Optional[str] = None
    exerciseDays: Optional[str] = None
    caffeineCups: Optional[str] = None
    alcoholDrinks: Optional[str] = None
    # Mind
    stressLevel: Optional[str] = None
    moodBaseline: Optional[str] = None
    lonelinessFrequency: Optional[str] = None

    @field_validator("mbti", mode="before")
    @classmethod
    def _normalize_mbti(cls, v):
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        v = v.strip().upper()
        if not v:
            return None
        return v if v in VALID_MBTI else None

    @field_validator("values", mode="before")
    @classmethod
    def _normalize_values(cls, v):
        if v is None:
            return None
        if not isinstance(v, dict):
            return None
        cleaned: dict[str, str] = {}
        for key, side in v.items():
            if not isinstance(key, str) or not isinstance(side, str):
                continue
            allowed = VALID_VALUES_DYADS.get(key)
            if allowed and side in allowed:
                cleaned[key] = side
        return cleaned or None

    _normalize_sleep = field_validator("sleepHours", mode="before")(
        _allowed_or_none(VALID_SLEEP_HOURS)
    )
    _normalize_exercise = field_validator("exerciseDays", mode="before")(
        _allowed_or_none(VALID_EXERCISE_DAYS)
    )
    _normalize_caffeine = field_validator("caffeineCups", mode="before")(
        _allowed_or_none(VALID_CAFFEINE_CUPS)
    )
    _normalize_alcohol = field_validator("alcoholDrinks", mode="before")(
        _allowed_or_none(VALID_ALCOHOL_DRINKS)
    )
    _normalize_stress = field_validator("stressLevel", mode="before")(
        _allowed_or_none(VALID_STRESS_LEVELS)
    )
    _normalize_mood = field_validator("moodBaseline", mode="before")(
        _allowed_or_none(VALID_MOOD_BASELINES)
    )
    _normalize_loneliness = field_validator("lonelinessFrequency", mode="before")(
        _allowed_or_none(VALID_LONELINESS_FREQUENCIES)
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_profile_model.py -v`
Expected: PASS for all profile tests (existing ones still green).

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/profile.py backend/tests/test_profile_model.py
git commit -m "feat(profile): add optional body+mind health fields with bucket validators"
```

---

## Task 2: State model — body + mind deltas

**Files:**
- Modify: `backend/app/services/state_model.py`
- Create: `backend/tests/test_state_model_health.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_state_model_health.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_state_model_health.py -v`
Expected: FAIL — deltas not yet applied.

- [ ] **Step 3: Implement deltas**

Edit `backend/app/services/state_model.py`. Replace the body of `initial_state()` (lines 54–96, the function definition) with:

```python
def initial_state(profile: Profile) -> State:
    """Compute the starting state vector deterministically from the intake.

    These values are the seed; the planner walks them forward year-by-year using
    the drift rules described in `DRIFT_RULES_BLOCK` and the `state_impact` of
    each fired event.
    """
    work_intensity = _clamp(profile.workHours / 100.0)

    # Health strain: scaling with overwork plus a small age baseline.
    overwork = max(0.0, profile.workHours - 40) / 30.0
    age_baseline = max(0.0, profile.age - 25) * 0.005
    health_strain = 0.2 + overwork * 0.3 + age_baseline

    # Financial pressure: defaults moderate; topFear mentioning money raises it.
    fear_lower = profile.topFear.lower()
    money_words = ("money", "broke", "afford", "savings", "rent", "debt", "income")
    financial_pressure = 0.4 + (0.15 if any(w in fear_lower for w in money_words) else 0.0)

    # Career momentum: starts mid; goal mentioning ambition raises it slightly.
    goal_lower = profile.topGoal.lower()
    momentum_words = ("build", "create", "ship", "launch", "lead", "founder", "own")
    career_momentum = 0.6 + (0.08 if any(w in goal_lower for w in momentum_words) else 0.0)

    # Meaning drift: rises if the goal sounds aspirational AND work hours are high
    # (high gap between aspiration and execution).
    meaning_drift = 0.2
    if any(w in goal_lower for w in momentum_words) and profile.workHours > 55:
        meaning_drift = 0.35

    # Social isolation: rises with work intensity.
    social_isolation = 0.3 + max(0.0, work_intensity - 0.6) * 0.3

    # Apply optional health-intake deltas. None values contribute nothing.
    health_strain += _SLEEP_HEALTH_DELTA.get(profile.sleepHours, 0.0)
    health_strain += _EXERCISE_HEALTH_DELTA.get(profile.exerciseDays, 0.0)
    health_strain += _CAFFEINE_HEALTH_DELTA.get(profile.caffeineCups, 0.0)
    health_strain += _ALCOHOL_HEALTH_DELTA.get(profile.alcoholDrinks, 0.0)

    meaning_drift += _STRESS_MEANING_DELTA.get(profile.stressLevel, 0.0)
    health_strain += _STRESS_HEALTH_DELTA.get(profile.stressLevel, 0.0)
    meaning_drift += _MOOD_MEANING_DELTA.get(profile.moodBaseline, 0.0)
    social_isolation += _LONELINESS_SOCIAL_DELTA.get(profile.lonelinessFrequency, 0.0)

    return State(
        work_intensity=work_intensity,
        financial_pressure=_clamp(financial_pressure),
        social_isolation=_clamp(social_isolation),
        family_distance=0.3,
        health_strain=_clamp(health_strain),
        career_momentum=_clamp(career_momentum),
        meaning_drift=_clamp(meaning_drift),
        relationship_strain=0.3,
    )


# Health-intake delta tables. Anything not listed contributes 0.
_SLEEP_HEALTH_DELTA: dict[str | None, float] = {
    "<5": 0.15, "5-6": 0.08, "6-7": 0.02, "7-8": -0.05, "8+": -0.03,
}
_EXERCISE_HEALTH_DELTA: dict[str | None, float] = {
    "0": 0.08, "1-2": 0.02, "3-4": -0.05, "5+": -0.10,
}
_CAFFEINE_HEALTH_DELTA: dict[str | None, float] = {
    "3": 0.02, "4+": 0.05,
}
_ALCOHOL_HEALTH_DELTA: dict[str | None, float] = {
    "4-7": 0.02, "8-14": 0.05, "15+": 0.12,
}
_STRESS_MEANING_DELTA: dict[str | None, float] = {
    "moderate": 0.03, "high": 0.08, "severe": 0.15,
}
_STRESS_HEALTH_DELTA: dict[str | None, float] = {
    "high": 0.05, "severe": 0.10,
}
_MOOD_MEANING_DELTA: dict[str | None, float] = {
    "mostly low": 0.12, "mixed": 0.05, "mostly positive": -0.05,
}
_LONELINESS_SOCIAL_DELTA: dict[str | None, float] = {
    "sometimes": 0.05, "often": 0.15,
}
```

(The `_clamp` helper at the bottom of the file stays unchanged. Keep `DRIFT_RULES_BLOCK` exactly as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_state_model_health.py tests/test_profile_model.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/state_model.py backend/tests/test_state_model_health.py
git commit -m "feat(state): seed health/meaning/social aspects from health intake"
```

---

## Task 3: Clinical models

**Files:**
- Create: `backend/app/models/clinical.py`
- Modify: `backend/app/models/simulation.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_clinical_model.py`:

```python
import pytest
from pydantic import ValidationError

from app.models.clinical import ClinicalRiskFactor, ClinicalSummary


def test_clinical_summary_round_trips() -> None:
    cs = ClinicalSummary(
        riskFactors=[
            ClinicalRiskFactor(label="Sleep debt", consequence="Worn cardiac headroom by 50."),
            ClinicalRiskFactor(label="Isolation", consequence="A late, quieter season."),
        ],
        finalHealthState="strained",
    )
    dumped = cs.model_dump()
    assert dumped["finalHealthState"] == "strained"
    assert len(dumped["riskFactors"]) == 2


def test_clinical_summary_rejects_unknown_state() -> None:
    with pytest.raises(ValidationError):
        ClinicalSummary(riskFactors=[], finalHealthState="great")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clinical_model.py -v`
Expected: FAIL — `app.models.clinical` does not exist.

- [ ] **Step 3: Create `backend/app/models/clinical.py`**

```python
"""Clinical-summary types — the right-side card on the reveal screen."""
from typing import Literal

from pydantic import BaseModel

HealthState = Literal["stable", "strained", "critical"]


class ClinicalRiskFactor(BaseModel):
    label: str
    consequence: str


class ClinicalSummary(BaseModel):
    """Combined body + mind risk readout. Ships inside SimulationData."""

    riskFactors: list[ClinicalRiskFactor]
    finalHealthState: HealthState
```

- [ ] **Step 4: Wire `clinicalSummary` into `SimulationData`**

Replace `backend/app/models/simulation.py` with:

```python
from typing import Optional

from pydantic import BaseModel, Field

from app.models.checkpoint import Checkpoint
from app.models.clinical import ClinicalSummary
from app.models.orchestration import AgentSpec
from app.models.portrait import AgedPortrait
from app.models.profile import Profile


class SimulationData(BaseModel):
    """Mirrors frontend `src/types.ts` SimulationData exactly.

    The single object returned by POST /simulate. The frontend stores it and
    drives all eight screens from this payload.
    """

    profile: Profile
    agents: list[AgentSpec] = Field(default_factory=list)
    agedPortraits: list[AgedPortrait] = []
    checkpointsHigh: list[Checkpoint]
    futureSelfOpening: str
    futureSelfReplies: dict[str, str]
    clinicalSummary: Optional[ClinicalSummary] = None
```

- [ ] **Step 5: Re-export from `backend/app/models/__init__.py`**

Replace its body with:

```python
from app.models.chat import ChatMessage, ChatRequest, ChatResponse
from app.models.checkpoint import Checkpoint, Tone
from app.models.clinical import ClinicalRiskFactor, ClinicalSummary, HealthState
from app.models.portrait import AgedPortrait, Trajectory
from app.models.profile import Profile
from app.models.simulation import SimulationData

__all__ = [
    "AgedPortrait",
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "Checkpoint",
    "ClinicalRiskFactor",
    "ClinicalSummary",
    "HealthState",
    "Profile",
    "SimulationData",
    "Tone",
    "Trajectory",
]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clinical_model.py tests/test_simulation_model.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/clinical.py backend/app/models/simulation.py backend/app/models/__init__.py backend/tests/test_clinical_model.py
git commit -m "feat(models): add ClinicalSummary type and attach it to SimulationData"
```

---

## Task 4: Health prompt block + injection

**Files:**
- Modify: `backend/app/prompts/orchestration.py`
- Create: `backend/tests/test_health_prompt_block.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_health_prompt_block.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_health_prompt_block.py -v`
Expected: FAIL — `_health_block` not defined; not yet injected.

- [ ] **Step 3: Add `_health_block` to `orchestration.py`**

Append to `backend/app/prompts/orchestration.py`, just below `_values_block`:

```python
# Display labels for each health field. Keys mirror the Profile bucket strings
# (so the block reads back what the user actually picked, not a re-encoded
# version). Two-section layout: Body / Mind. Body or Mind subhead is omitted
# when none of its fields are set.

_HEALTH_BODY_LABELS: list[tuple[str, str, str]] = [
    # (Profile attribute, prefix shown to the model, suffix unit)
    ("sleepHours", "Sleep", "hrs/night"),
    ("exerciseDays", "Exercise", "days/week"),
    ("caffeineCups", "Caffeine", "cups/day"),
    ("alcoholDrinks", "Alcohol", "drinks/week"),
]

_HEALTH_MIND_LABELS: list[tuple[str, str, str]] = [
    ("stressLevel", "Stress", ""),
    ("moodBaseline", "Mood", ""),
    ("lonelinessFrequency", "Loneliness", ""),
]


def _health_block(profile: Profile) -> str:
    """Return a formatted block of health-intake answers, or '' if nothing set.

    Empty string when all seven fields are None — keeps prompts byte-identical
    to the pre-feature world. Otherwise returns a leading-newline block that
    inline-appends after the work-hours bullet, just like _mbti_block.
    """

    def _section(items: list[tuple[str, str, str]]) -> list[str]:
        lines: list[str] = []
        for attr, prefix, suffix in items:
            val = getattr(profile, attr, None)
            if val is None:
                continue
            line = f"  - {prefix}: {val}"
            if suffix:
                line += f" {suffix}"
            lines.append(line)
        return lines

    body_lines = _section(_HEALTH_BODY_LABELS)
    mind_lines = _section(_HEALTH_MIND_LABELS)
    if not body_lines and not mind_lines:
        return ""

    out = ["\nHealth background:"]
    if body_lines:
        out.append("  Body:")
        out.extend(body_lines)
    if mind_lines:
        out.append("  Mind:")
        out.extend(mind_lines)
    return "\n".join(out)
```

- [ ] **Step 4: Inject `_health_block` into all renderers**

In `render_counting_user` (around line 86–97), change the f-string suffix from:
```python
- target year: {profile.targetYear} (present year: {profile.presentYear}){_mbti_block(profile)}{_values_block(profile)}
```
to:
```python
- target year: {profile.targetYear} (present year: {profile.presentYear}){_mbti_block(profile)}{_values_block(profile)}{_health_block(profile)}
```

In `render_planning_user` (around line 351), change:
```python
- name: {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}
```
to (append `_health_block`):
```python
- name: {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}{_health_block(profile)}
```

In `render_branched_planning_user` (around line 220), apply the identical change to the same line.

In `render_detail_user` (around line 458), change:
```python
- {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}
```
to:
```python
- {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}{_health_block(profile)}
```

In `render_finalize_user`, the current preamble is:
```python
Profile:
- {profile.name}, age {profile.age} → {profile.targetYear}
- top goal at start: {profile.topGoal}
- top fear at start: {profile.topFear}
```

Change it to:
```python
Profile:
- {profile.name}, age {profile.age} → {profile.targetYear}
- top goal at start: {profile.topGoal}
- top fear at start: {profile.topFear}{_health_block(profile)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_health_prompt_block.py tests/test_personality_prompt_blocks.py -v`
Expected: all PASS (existing personality block tests must still pass).

- [ ] **Step 6: Commit**

```bash
git add backend/app/prompts/orchestration.py backend/tests/test_health_prompt_block.py
git commit -m "feat(prompts): inject body+mind health block into all four orchestration prompts"
```

---

## Task 5: Clinical-summary prompt + parser

**Files:**
- Modify: `backend/app/prompts/orchestration.py`
- Create: `backend/tests/test_clinical_prompt.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_clinical_prompt.py`:

```python
import json

import pytest

from app.models.checkpoint import Checkpoint
from app.models.clinical import ClinicalSummary
from app.models.profile import Profile
from app.prompts.orchestration import (
    CLINICAL_SUMMARY_SYSTEM,
    parse_clinical_summary,
    render_clinical_user,
)


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer",
        workHours=70, topGoal="ship the thing",
        topFear="ending up alone",
        targetYear=2046, presentYear=2026,
        sleepHours="<5", exerciseDays="0",
        stressLevel="severe", moodBaseline="mostly low",
        lonelinessFrequency="often",
    )


def _checkpoints() -> list[Checkpoint]:
    return [
        Checkpoint(year=2030, age=36, title="The first cardiologist appointment",
                   event="A scare at 36.", did="Booked the appointment.",
                   consequence="A new prescription on the counter.", tone="warn"),
        Checkpoint(year=2040, age=46, title="Her sister's wedding, on Zoom",
                   event="The reception was small.", did="Watched from a hotel room.",
                   consequence="The text afterwards was short.", tone="neutral"),
    ]


def test_render_clinical_user_includes_profile_and_trajectory() -> None:
    out = render_clinical_user(_profile(), _checkpoints(), "strained")
    assert "Sam" in out
    assert "2030" in out
    assert "cardiologist" in out
    # Health intake context must reach the model.
    assert "Body:" in out
    assert "Mind:" in out
    # Final state hint is included.
    assert "strained" in out


def test_clinical_system_prompt_lists_state_choices_and_factor_count() -> None:
    assert "stable" in CLINICAL_SUMMARY_SYSTEM
    assert "strained" in CLINICAL_SUMMARY_SYSTEM
    assert "critical" in CLINICAL_SUMMARY_SYSTEM
    assert "2" in CLINICAL_SUMMARY_SYSTEM
    assert "3" in CLINICAL_SUMMARY_SYSTEM


def test_parse_clinical_summary_accepts_well_formed_json() -> None:
    raw = json.dumps({
        "riskFactors": [
            {"label": "Sleep debt", "consequence": "A worn heart by 50."},
            {"label": "Isolation", "consequence": "Fewer hands at the table."},
        ],
        "finalHealthState": "strained",
    })
    cs = parse_clinical_summary(raw)
    assert isinstance(cs, ClinicalSummary)
    assert cs.finalHealthState == "strained"
    assert len(cs.riskFactors) == 2


def test_parse_clinical_summary_tolerates_code_fence() -> None:
    raw = "```json\n" + json.dumps({
        "riskFactors": [{"label": "x", "consequence": "y"}],
        "finalHealthState": "stable",
    }) + "\n```"
    cs = parse_clinical_summary(raw)
    assert cs.finalHealthState == "stable"


def test_parse_clinical_summary_returns_none_on_garbage() -> None:
    assert parse_clinical_summary("not json at all") is None
    assert parse_clinical_summary(json.dumps({"riskFactors": []})) is None  # missing finalHealthState
    assert parse_clinical_summary(json.dumps({
        "riskFactors": [{"label": "x", "consequence": "y"}],
        "finalHealthState": "fantastic",
    })) is None  # invalid enum
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clinical_prompt.py -v`
Expected: FAIL — `CLINICAL_SUMMARY_SYSTEM`, `render_clinical_user`, `parse_clinical_summary` are not defined.

- [ ] **Step 3: Add the prompt and parser**

Append to `backend/app/prompts/orchestration.py`:

```python
# ---------------------------------------------------------------------------
# CLINICAL SUMMARY — final card that ships in the reveal.

CLINICAL_SUMMARY_SYSTEM = f"""\
You are the clinical-summary agent for AlterEgo. The simulation has run; the \
person has lived through the trajectory. Your job is to write the short, honest \
read-out that appears next to their future-self portrait.

Output 2 to 3 modifiable risk factors. Mix freely across body and mind: sleep \
debt, sedentary baseline, alcohol load, chronic stress, low mood, isolation, \
overwork — pick whichever 2 to 3 are most load-bearing for THIS run, grounded \
in the events that fired and the user's stated health background. Don't list \
things that didn't matter for this trajectory.

Each risk factor is one short label and one one-sentence consequence. The \
consequence must reference something that actually happened in the trajectory \
(an event, a relationship beat) rather than generic warnings.

Then output finalHealthState: one of "stable", "strained", "critical". Pick \
based on the cumulative state the trajectory ended in, not on a single event.

{TONE_BLOCK}

# Output (strict JSON, no prose, no code fence)

{{
  "riskFactors": [
    {{"label": "short label, ≤4 words", "consequence": "one sentence, ≤22 words"}},
    ...
  ],
  "finalHealthState": "stable" | "strained" | "critical"
}}

Rules:
- Exactly 2 or 3 entries in riskFactors.
- finalHealthState is exactly one of the three allowed strings.
- No motivational language. Honest, contemplative, direct.
"""


def render_clinical_user(
    profile: Profile,
    checkpoints: list[Checkpoint],
    final_state_hint: str,
) -> str:
    cps = "\n".join(
        f"  {c.year} (age {c.age}): {c.title}. {c.event} {c.did} {c.consequence}"
        for c in checkpoints
    )
    return f"""\
Profile:
- {profile.name}, age {profile.age} → {profile.targetYear}
- top goal at start: {profile.topGoal}
- top fear at start: {profile.topFear}{_health_block(profile)}

Lived trajectory:
{cps}

Final-state hint (from the simulation's state vector): {final_state_hint}

Output the JSON object only."""


def parse_clinical_summary(raw: str) -> Optional["ClinicalSummary"]:
    """Parse the model's clinical-summary response. Returns None on any
    failure — the orchestrator treats that as 'no clinical card' and the
    reveal screen stacks back to its single-column layout."""
    from app.models.clinical import ClinicalSummary  # local import: avoid cycle

    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    try:
        return ClinicalSummary.model_validate(data)
    except Exception:
        return None
```

Add the two new imports at the top of `orchestration.py` (just below the existing `from typing import Optional`):

```python
import json
import re
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clinical_prompt.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/prompts/orchestration.py backend/tests/test_clinical_prompt.py
git commit -m "feat(prompts): add clinical-summary system prompt, renderer, and tolerant parser"
```

---

## Task 6: Orchestrator — produce the clinical summary in the finalize phase

**Files:**
- Modify: `backend/app/services/orchestrator.py`
- Create: `backend/tests/test_orchestrator_clinical.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_orchestrator_clinical.py`:

```python
import json

import pytest

from app.models.checkpoint import Checkpoint
from app.models.profile import Profile
from app.services.orchestrator import _generate_clinical_summary


class _FakeRouter:
    def __init__(self, response: str):
        self.response = response
        self.calls = 0

    async def complete(self, **kwargs) -> str:
        self.calls += 1
        return self.response


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=70,
        topGoal="ship the thing", topFear="ending up alone",
        targetYear=2046, presentYear=2026,
        sleepHours="<5", stressLevel="severe",
    )


def _checkpoints() -> list[Checkpoint]:
    return [
        Checkpoint(year=2030, age=36, title="A scare", event="x", did="y",
                   consequence="z", tone="warn"),
    ]


@pytest.mark.asyncio
async def test_generate_clinical_summary_returns_parsed_object() -> None:
    response = json.dumps({
        "riskFactors": [
            {"label": "Sleep debt", "consequence": "Worn cardiac headroom."},
            {"label": "Isolation", "consequence": "Fewer hands at the table."},
        ],
        "finalHealthState": "strained",
    })
    router = _FakeRouter(response)
    cs = await _generate_clinical_summary(_profile(), _checkpoints(), "strained", router)
    assert cs is not None
    assert cs.finalHealthState == "strained"
    assert len(cs.riskFactors) == 2
    assert router.calls == 1


@pytest.mark.asyncio
async def test_generate_clinical_summary_returns_none_on_garbage() -> None:
    router = _FakeRouter("totally not json")
    cs = await _generate_clinical_summary(_profile(), _checkpoints(), "stable", router)
    assert cs is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_orchestrator_clinical.py -v`
Expected: FAIL — `_generate_clinical_summary` does not exist.

- [ ] **Step 3: Implement clinical-summary generation in orchestrator**

In `backend/app/services/orchestrator.py`:

3a. Update the imports block at the top to add the new prompt names. Replace the `from app.prompts.orchestration import (...)` block with:

```python
from app.prompts.orchestration import (
    CLINICAL_SUMMARY_SYSTEM,
    COUNTING_SYSTEM,
    DETAIL_SYSTEM,
    FINALIZE_SYSTEM,
    PLANNING_SYSTEM,
    parse_clinical_summary,
    render_branched_planning_user,
    render_clinical_user,
    render_counting_user,
    render_detail_user,
    render_finalize_user,
    render_planning_user,
)
```

3b. Update the `from app.models import ...` block at the top to include `ClinicalSummary`:

```python
from app.models import AgedPortrait, Checkpoint, ClinicalSummary, Profile, SimulationData
```

3c. Add a new helper at the bottom of the "Phase helpers" section (immediately after `_finalize`):

```python
async def _generate_clinical_summary(
    profile: Profile,
    checkpoints: list[Checkpoint],
    final_state_hint: str,
    router: AgentRouter,
) -> ClinicalSummary | None:
    """Run the clinical-summary prompt. Returns None on any failure — the
    reveal screen treats absence as 'no clinical card' and renders its legacy
    single-column layout."""
    try:
        raw = await router.complete(
            tier=Tier.HIGH_SIGNAL,
            system=CLINICAL_SUMMARY_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": render_clinical_user(profile, checkpoints, final_state_hint),
                }
            ],
            max_tokens=1000,
        )
    except Exception:  # noqa: BLE001 — never break the run on a clinical fail
        return None
    return parse_clinical_summary(raw)
```

3d. Add a small helper to derive a final-state hint from the run. Add it right above `_generate_clinical_summary`:

```python
def _final_state_hint(checkpoints: list[Checkpoint]) -> str:
    """Cheap hint based on the count of warn-toned checkpoints. The clinical
    prompt uses this only as a directional signal — the model also sees the
    full trajectory and the health-intake block."""
    if not checkpoints:
        return "stable"
    warn_count = sum(1 for c in checkpoints if c.tone == "warn")
    if warn_count >= max(3, len(checkpoints) // 2):
        return "critical"
    if warn_count >= 1:
        return "strained"
    return "stable"
```

3e. In `stream_simulation`, replace the `final_payload = await finalize_task` block (and what follows up to the `sim = SimulationData(...)` construction) with:

```python
        final_payload = await finalize_task
        hero = await hero_task if hero_task is not None else None
        hero_portraits: list[AgedPortrait] = [hero] if hero is not None else []

        clinical = await _generate_clinical_summary(
            profile, completed, _final_state_hint(completed), router
        )

        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
            clinicalSummary=clinical,
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}
```

3f. Apply the same construction change inside `stream_branched_simulation` so branched runs also surface a clinical card. The block to replace is the analogous one starting `final_payload = await finalize_task`:

```python
        final_payload = await finalize_task
        hero = await hero_task if hero_task is not None else None
        hero_portraits: list[AgedPortrait] = [hero] if hero is not None else []

        clinical = await _generate_clinical_summary(
            profile, completed, _final_state_hint(completed), router
        )

        sim = SimulationData(
            profile=profile,
            agents=agents,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
            clinicalSummary=clinical,
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}
```

- [ ] **Step 4: Run all backend tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest -v`
Expected: full suite PASS, including `test_orchestrator_clinical.py`. Existing tests stay green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/orchestrator.py backend/tests/test_orchestrator_clinical.py
git commit -m "feat(orchestrator): produce ClinicalSummary in finalize and ship in /simulate complete payload"
```

---

## Task 7: Frontend types

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Replace the file**

Replace the contents of `frontend/src/types.ts` with:

```typescript
export type Tone = "neutral" | "warn" | "good";
export type Trajectory = "high" | "low";

export type SleepHours = "<5" | "5-6" | "6-7" | "7-8" | "8+";
export type ExerciseDays = "0" | "1-2" | "3-4" | "5+";
export type CaffeineCups = "0" | "1" | "2" | "3" | "4+";
export type AlcoholDrinks = "0" | "1-3" | "4-7" | "8-14" | "15+";
export type StressLevel = "low" | "moderate" | "high" | "severe";
export type MoodBaseline = "mostly low" | "mixed" | "mostly steady" | "mostly positive";
export type LonelinessFrequency = "rarely" | "sometimes" | "often";

export interface Profile {
  name: string;
  age: number;
  occupation: string;
  workHours: number;
  topGoal: string;
  topFear: string;
  targetYear: number;
  presentYear: number;
  mbti?: string | null;
  values?: Record<string, string> | null;
  // Body
  sleepHours?: SleepHours | null;
  exerciseDays?: ExerciseDays | null;
  caffeineCups?: CaffeineCups | null;
  alcoholDrinks?: AlcoholDrinks | null;
  // Mind
  stressLevel?: StressLevel | null;
  moodBaseline?: MoodBaseline | null;
  lonelinessFrequency?: LonelinessFrequency | null;
}

export interface Checkpoint {
  year: number;
  age: number;
  title: string;
  event: string;
  did: string;
  consequence: string;
  tone: Tone;
}

export interface AgedPortrait {
  age: number;
  year: number;
  trajectory: Trajectory;
  imageUrl: string | null;
}

export type HealthState = "stable" | "strained" | "critical";

export interface ClinicalRiskFactor {
  label: string;
  consequence: string;
}

export interface ClinicalSummary {
  riskFactors: ClinicalRiskFactor[];
  finalHealthState: HealthState;
}

export interface SimulationData {
  profile: Profile;
  agents: AgentSpec[];
  agedPortraits: AgedPortrait[];
  checkpointsHigh: Checkpoint[];
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
  clinicalSummary?: ClinicalSummary | null;
}

// --- Streaming orchestration shapes ---

export interface AgentSpec {
  agent_id: string;
  role: string;
  name: string;
  relationship: string;
  voice: string;
}

export interface OutlineEvent {
  year: number;
  severity: number;
  primary_actors: string[];
  visibility: string[];
  hint: string;
}

export type StreamEvent =
  | { phase: "counting"; agents: AgentSpec[] }
  | { phase: "plan"; outline: OutlineEvent[] }
  | { phase: "event"; index: number; checkpoint: Checkpoint }
  | { phase: "finalizing" }
  | { phase: "portrait"; trajectory: Trajectory; index: number; portrait: AgedPortrait }
  | { phase: "portrait_error"; trajectory: Trajectory; index: number; message: string }
  | { phase: "complete"; simulation: SimulationData }
  | { phase: "error"; message: string };
```

- [ ] **Step 2: Run typecheck to verify no regressions**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no new errors introduced).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(types): add Profile health buckets and ClinicalSummary types"
```

---

## Task 8: ScreenHealth component (frontend)

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

- [ ] **Step 1: Add the constants and the screen**

In `frontend/src/screens/screens-a.tsx`, add the following block immediately above the existing `export function ScreenIntake(...)` declaration (i.e. just after the `parseSpokenInteger` helper):

```tsx
type HealthFieldKey =
  | "sleepHours"
  | "exerciseDays"
  | "caffeineCups"
  | "alcoholDrinks"
  | "stressLevel"
  | "moodBaseline"
  | "lonelinessFrequency";

interface HealthRow {
  key: HealthFieldKey;
  label: string;
  options: string[];
  suffix?: string;
}

const HEALTH_BODY_ROWS: HealthRow[] = [
  { key: "sleepHours", label: "Sleep per night", options: ["<5", "5-6", "6-7", "7-8", "8+"], suffix: "hrs" },
  { key: "exerciseDays", label: "Exercise per week", options: ["0", "1-2", "3-4", "5+"], suffix: "days" },
  { key: "caffeineCups", label: "Caffeine per day", options: ["0", "1", "2", "3", "4+"], suffix: "cups" },
  { key: "alcoholDrinks", label: "Alcohol per week", options: ["0", "1-3", "4-7", "8-14", "15+"], suffix: "drinks" },
];

const HEALTH_MIND_ROWS: HealthRow[] = [
  { key: "stressLevel", label: "Typical stress", options: ["low", "moderate", "high", "severe"] },
  { key: "moodBaseline", label: "Mood, last month", options: ["mostly low", "mixed", "mostly steady", "mostly positive"] },
  { key: "lonelinessFrequency", label: "Loneliness", options: ["rarely", "sometimes", "often"] },
];

function HealthButtonGroup({
  row,
  value,
  onSelect,
}: {
  row: HealthRow;
  value: string | null | undefined;
  onSelect: (next: string | null) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(12px, 2vw, 20px)",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          minWidth: 180,
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ink-1)",
        }}
      >
        {row.label}
        {row.suffix ? <span style={{ opacity: 0.55 }}> ({row.suffix})</span> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {row.options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(selected ? null : opt)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${selected ? "var(--accent)" : "var(--line-soft)"}`,
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--bg-1)" : "var(--ink-0)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                letterSpacing: "0.05em",
                cursor: "pointer",
                transition: "all 200ms var(--ease)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScreenHealth({ onContinue, onJumpTo, profile, setProfile }: ScreenProps) {
  const set = (key: HealthFieldKey, value: string | null) => {
    setProfile({ ...profile, [key]: value });
  };

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        animation: "fade-in 600ms var(--ease)",
      }}
    >
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            minHeight: "100%",
            maxWidth: 720,
            margin: "0 auto",
            padding: "clamp(64px, 10vh, 120px) clamp(20px, 4vw, 48px) 140px",
            display: "flex",
            flexDirection: "column",
            gap: "clamp(28px, 4vh, 44px)",
            boxSizing: "border-box",
          }}
        >
          <div>
            <h2
              className="serif"
              style={{
                fontSize: "clamp(28px, 3.5vw, 40px)",
                lineHeight: 1.15,
                fontWeight: 400,
                margin: 0,
              }}
            >
              A little about your body and mind.
            </h2>
            <Meta style={{ marginTop: 12 }}>
              All optional. Tap an answer to set it; tap again to clear.
            </Meta>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Meta style={{ color: "var(--accent)" }}>Body</Meta>
            {HEALTH_BODY_ROWS.map((row) => (
              <HealthButtonGroup
                key={row.key}
                row={row}
                value={profile[row.key] as string | null | undefined}
                onSelect={(next) => set(row.key, next)}
              />
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Meta style={{ color: "var(--accent)" }}>Mind</Meta>
            {HEALTH_MIND_ROWS.map((row) => (
              <HealthButtonGroup
                key={row.key}
                row={row}
                value={profile[row.key] as string | null | undefined}
                onSelect={(next) => set(row.key, next)}
              />
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              type="button"
              onClick={onContinue}
              style={{
                all: "unset",
                cursor: "pointer",
                fontFamily: "var(--mono)",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--accent)",
                padding: "12px 18px",
                border: "1px solid var(--accent)",
                borderRadius: 999,
                transition: "background 200ms var(--ease), color 200ms var(--ease)",
              }}
            >
              continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck to verify**

Run: `cd frontend && npm run typecheck`
Expected: PASS. The component uses existing `ScreenProps`, `Mark`, `Meta` — no new imports needed beyond what `screens-a.tsx` already has.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(screens): add ScreenHealth with body+mind button groups"
```

---

## Task 9: Insert health screen into App state machine

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Wire up the import and the SCREENS entry**

In `frontend/src/App.tsx`, find the existing imports for screen components (look for `ScreenIntake, ScreenLanding, ScreenProcessing, ScreenReveal, ScreenSelfie` — wherever they live in the file). Add `ScreenHealth` to that import list. Then locate the `SCREENS` array (around line 87) and replace it with:

```typescript
const SCREENS: ScreenDef[] = [
  { key: "landing", component: ScreenLanding, label: "01 cold open" },
  { key: "selfie", component: ScreenSelfie, label: "02 selfie" },
  { key: "intake", component: ScreenIntake, label: "03 intake" },
  { key: "health", component: ScreenHealth, label: "04 health" },
  { key: "processing", component: ScreenProcessing, label: "05 processing" },
  { key: "reveal", component: ScreenReveal, label: "06 reveal" },
  { key: "timeline", component: ScreenTimeline, label: "07 timeline" },
  { key: "chat", component: ScreenChat, label: "08 chat" },
  { key: "end", component: ScreenEnd, label: "09 end" },
];
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke test**

Run: `cd frontend && npm run dev` and open the printed URL. Click through landing → selfie → intake → finish intake → health screen appears. Confirm the dev nav dots show 9 entries. Tap an option and `continue →` advances to processing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(app): insert health screen between intake and processing"
```

---

## Task 10: Reveal screen — 2-column layout with ClinicalCard

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

- [ ] **Step 1: Add the `ClinicalCard` component**

Append to `frontend/src/screens/screens-a.tsx`, just below `ScreenHealth`:

```tsx
function ClinicalCard({
  summary,
  visible,
}: {
  summary: NonNullable<import("../types").SimulationData["clinicalSummary"]>;
  visible: boolean;
}) {
  const stateColor: Record<string, string> = {
    stable: "var(--good, var(--accent))",
    strained: "var(--accent)",
    critical: "var(--warn, var(--accent))",
  };
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 1600ms var(--ease)",
        maxWidth: 360,
        width: "100%",
        boxSizing: "border-box",
        padding: "24px 26px",
        borderTop: `1px solid ${stateColor[summary.finalHealthState]}`,
        borderBottom: `1px solid var(--line-soft)`,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Meta style={{ color: "var(--accent)" }}>clinical read</Meta>
        <Meta style={{ color: stateColor[summary.finalHealthState] }}>
          {summary.finalHealthState}
        </Meta>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {summary.riskFactors.map((rf, i) => (
          <li key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              className="serif"
              style={{ fontSize: 17, lineHeight: 1.3, fontStyle: "italic" }}
            >
              {rf.label}
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-1)" }}>
              {rf.consequence}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Replace the inner layout of `ScreenReveal`**

In `frontend/src/screens/screens-a.tsx`, find the `ScreenReveal` function. Locate the scroll container starting around `{/* Scroll container — content centers when it fits, scrolls when it doesn't */}` and ending where the existing centered-column `<div>` closes (just before the bottom-right "continue" button). Replace **only** that inner column `<div>` (the one with `display: "flex", flexDirection: "column", alignItems: "center"`) and its children up through the closing of the quote block, with a 2-column container. Concretely:

Find this block:
```tsx
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 40px 140px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(420px, 32vw)",
              height: "min(56vh, 560px)",
              flexShrink: 0,
              opacity: phase >= 1 ? 1 : 0,
              transition: "opacity 2200ms var(--ease)",
            }}
          >
            ... (portrait) ...
          </div>

          <div
            style={{
              marginTop: 36,
              textAlign: "center",
              opacity: phase >= 2 ? 1 : 0,
              transition: "opacity 1600ms var(--ease)",
            }}
          >
            <Meta style={{ marginBottom: 14 }}>
              ... (meta line) ...
            </Meta>
          </div>

          <div
            style={{
              maxWidth: 720,
              margin: "28px auto 0",
              textAlign: "center",
              minHeight: 130,
            }}
          >
            ... (quote, "future self speaking", continue button overlays) ...
          </div>
        </div>
```

Replace it with this 2-column structure. The portrait + meta + quote block becomes the left column (its existing children are unchanged); the right column conditionally renders `<ClinicalCard>` when `simulation?.clinicalSummary` is present:

```tsx
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(24px, 4vw, 64px)",
            padding: "80px 40px 140px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              flex: "1 1 520px",
              maxWidth: 720,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "min(420px, 32vw)",
                height: "min(56vh, 560px)",
                flexShrink: 0,
                opacity: phase >= 1 ? 1 : 0,
                transition: "opacity 2200ms var(--ease)",
              }}
            >
              {(() => {
                const p = nearestPortrait(simulation?.agedPortraits, "high", profile.targetYear);
                return <PortraitImage src={p?.imageUrl} alt={p ? `you at ${p.age}` : "you"} />;
              })()}
            </div>

            <div
              style={{
                marginTop: 36,
                textAlign: "center",
                opacity: phase >= 2 ? 1 : 0,
                transition: "opacity 1600ms var(--ease)",
              }}
            >
              <Meta style={{ marginBottom: 14 }}>
                {profile.name || "Sarah"} · {profile.targetYear || 2046}
              </Meta>
            </div>

            <div
              style={{
                maxWidth: 720,
                margin: "28px auto 0",
                textAlign: "center",
                minHeight: 130,
              }}
            >
              {phase >= 3 && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 22,
                    animation: "fade-in 700ms var(--ease) both",
                  }}
                >
                  <Wave />
                  <span className="meta" style={{ color: "var(--accent)" }}>
                    future self speaking
                  </span>
                </div>
              )}
              <p
                className="serif"
                style={{
                  fontStyle: "italic",
                  fontSize: "clamp(20px, 2.2vw, 26px)",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {streamed}
              </p>
            </div>
          </div>

          {simulation?.clinicalSummary ? (
            <div
              style={{
                flex: "0 1 360px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <ClinicalCard
                summary={simulation.clinicalSummary}
                visible={phase >= 3}
              />
            </div>
          ) : null}
        </div>
```

> **Important:** the original quote `<p className="serif">` code may include extra logic (caret, streaming animation, voice pauses) — preserve that *exactly*. The block above is a minimal sketch of the quote area; copy whatever the current `ScreenReveal` actually renders inside the quote container. The only structural change is wrapping the existing portrait + meta + quote in a left-column flex item and adding the right-column `ClinicalCard`.

- [ ] **Step 2b: Verify the original quote markup is preserved**

Open the post-edit `ScreenReveal` and confirm: the streaming caret, the voice indicator, and any audio handling that previously sat inside the quote container all still render. If your editor's diff tool removed any of it, restore it from `git show HEAD:frontend/src/screens/screens-a.tsx`.

- [ ] **Step 3: Run typecheck and dev server**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

Then `cd frontend && npm run dev`. Visit the dev nav and jump to the reveal screen. Mock data: temporarily edit `frontend/src/data.ts` (or whatever exposes `AE_DATA`) to attach a `clinicalSummary` to the dev fixture so the right column renders. Verify:
- At ≥1024 px wide, portrait/quote sit on the left, clinical card on the right.
- At <1024 px, the card wraps below the quote.
- When `clinicalSummary` is null, the layout still renders cleanly (just the left column).

After verifying, revert the `data.ts` edit (the real card comes from the backend now).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(reveal): render ClinicalCard alongside portrait at desktop, stack on mobile"
```

---

## Task 11: End-to-end smoke

**Files:**
- (no edits)

- [ ] **Step 1: Backend up**

Run: `./scripts/dev.sh` (or activate the venv and `uvicorn app.main:app --reload --port 8000`).

- [ ] **Step 2: Frontend up**

Run: `cd frontend && npm run dev`.

- [ ] **Step 3: Walk the flow**

In the browser, complete the full intake → health (fill in body + mind) → processing → reveal. Confirm:
- The reveal shows portrait + clinical card side-by-side at desktop width.
- The card lists 2–3 risk factors and a `stable` / `strained` / `critical` label.
- The future-self quote and voice (if enabled) still play unchanged.

- [ ] **Step 4: Walk the flow with health intake skipped**

Repeat, but tap `continue →` on the health screen without selecting anything. Confirm:
- The simulation runs unchanged.
- The reveal still works. The clinical card may be present or absent depending on whether the model produced one — both render cleanly.

- [ ] **Step 5: Run the full backend suite once more**

Run: `cd backend && source .venv/bin/activate && pytest -v`
Expected: full suite green.

---

## Self-Review

**Spec coverage:**
- New `health` screen between `intake` and `processing` → Tasks 8–9.
- Seven body+mind button groups, all optional, toggle-to-clear → Task 8.
- Profile additions + validators → Task 1.
- State-model deltas (body to `health_strain`; mind to `meaning_drift` / `social_isolation` / `health_strain`) → Task 2.
- `ClinicalSummary` type wired into `SimulationData` → Task 3.
- `_health_block` injected into all four orchestration prompts → Task 4.
- `CLINICAL_SUMMARY_SYSTEM` + `render_clinical_user` + tolerant parser → Task 5.
- Generate `ClinicalSummary` at end of `finalizing`, attach to `complete` payload, both flat and branched paths → Task 6.
- Frontend types, screen, App wiring, reveal 2-column with `ClinicalCard` → Tasks 7–10.
- End-to-end smoke and back-compat for cleared health intake → Task 11.

**Placeholder scan:** No "TBD" / "implement later" / "similar to" — every code change ships its concrete code.

**Type consistency:** `ClinicalSummary`, `ClinicalRiskFactor`, `HealthState`, `Profile` health fields appear with identical names and option strings across backend (`models/clinical.py`, `models/profile.py`), prompts (`render_clinical_user`), orchestrator (`_generate_clinical_summary`), and frontend (`types.ts`, `ScreenHealth`, `ClinicalCard`). The Profile bucket strings (e.g. `"6-7"`, `"mostly steady"`) match exactly between the backend `frozenset`s and the frontend `const`s — verify by grepping if a discrepancy is suspected.
