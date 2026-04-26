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
