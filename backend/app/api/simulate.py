import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.models import Profile, SimulationData
from app.services.orchestrator import stream_branched_simulation, stream_simulation

router = APIRouter()

# Defense-in-depth cap; the frontend already downscales to ~1024px before upload.
MAX_SELFIE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("")
async def simulate_future_stream(
    profile: str = Form(...),
    selfie: UploadFile | None = File(None),
) -> StreamingResponse:
    """Stream the multi-step simulation as NDJSON.

    Phases (in order, with portraits streaming after `complete`):
      counting → plan → event × N → finalizing → complete
      → portrait × ≤10 (interleaved with portrait_error)
    """
    p = _parse_profile(profile)
    selfie_bytes, selfie_mime = await _read_selfie(selfie)

    return StreamingResponse(
        _ndjson(stream_simulation(p, selfie_bytes, selfie_mime)),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/branch")
async def simulate_branch(
    profile: str = Form(...),
    intervention_year: int = Form(...),
    intervention_text: str = Form(...),
    original_simulation: str = Form(...),
    selfie: UploadFile | None = File(None),
) -> StreamingResponse:
    """Re-stream a simulation with a user intervention baked in.

    Pre-intervention checkpoints AND high portraits are preserved from the
    original simulation. Post-intervention years are re-planned. The low
    trajectory and its portraits are regenerated whole."""
    p = _parse_profile(profile)
    try:
        original = SimulationData.model_validate_json(original_simulation)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"original_simulation: {e}")
    selfie_bytes, selfie_mime = await _read_selfie(selfie)

    intervention = {"year": intervention_year, "text": intervention_text}
    return StreamingResponse(
        _ndjson(
            stream_branched_simulation(
                p,
                intervention=intervention,
                original_simulation=original,
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
            )
        ),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _parse_profile(raw: str) -> Profile:
    try:
        return Profile.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"profile: {e}")


async def _read_selfie(selfie: UploadFile | None) -> tuple[bytes | None, str]:
    if selfie is None:
        return None, "image/jpeg"
    data = await selfie.read(MAX_SELFIE_BYTES + 1)
    if len(data) > MAX_SELFIE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"selfie exceeds {MAX_SELFIE_BYTES // (1024 * 1024)} MB",
        )
    return data, selfie.content_type or "image/jpeg"


async def _ndjson(events: AsyncIterator[dict]) -> AsyncIterator[bytes]:
    async for ev in events:
        yield (json.dumps(ev) + "\n").encode("utf-8")
