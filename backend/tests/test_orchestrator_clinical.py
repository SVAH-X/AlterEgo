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
