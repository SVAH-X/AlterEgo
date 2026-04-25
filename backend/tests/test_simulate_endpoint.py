import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def _profile_dict() -> dict:
    return {
        "name": "Sam", "age": 32, "occupation": "lawyer",
        "workHours": 60, "topGoal": "x", "topFear": "y",
        "targetYear": 2046, "presentYear": 2026,
    }


def test_simulate_accepts_multipart_with_selfie() -> None:
    async def fake_stream(profile, selfie_bytes, selfie_mime, intervention=None):
        assert selfie_bytes == b"FAKESELFIE"
        assert selfie_mime == "image/jpeg"
        yield {"phase": "complete", "simulation": {
            "profile": profile.model_dump(),
            "agedPortraits": [],
            "checkpointsHigh": [],
            "checkpointsLow": [],
            "futureSelfOpening": "x",
            "futureSelfReplies": {},
        }}

    with patch("app.api.simulate.stream_simulation", new=fake_stream):
        client = TestClient(app)
        resp = client.post(
            "/simulate",
            data={"profile": json.dumps(_profile_dict())},
            files={"selfie": ("me.jpg", b"FAKESELFIE", "image/jpeg")},
        )
    assert resp.status_code == 200
    lines = [json.loads(line) for line in resp.iter_lines() if line]
    assert lines[-1]["phase"] == "complete"
