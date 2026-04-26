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
