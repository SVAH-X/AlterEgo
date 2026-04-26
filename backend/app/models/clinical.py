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
