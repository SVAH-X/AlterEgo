import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from app.models import Profile, SimulationData
from app.services.orchestrator import stream_branched_simulation, stream_simulation

router = APIRouter()

# Defense-in-depth cap; the frontend already downscales to ~1024px before upload.
MAX_SELFIE_BYTES = 10 * 1024 * 1024  # 10 MB
# Starlette's default per-part cap is 1 MB, which trips on the embedded
# base64 portrait payload inside `original_simulation`. Raise it generously.
MAX_PART_BYTES = 32 * 1024 * 1024  # 32 MB


@router.post("")
async def simulate_future_stream(request: Request) -> StreamingResponse:
    """Stream the multi-step simulation as NDJSON.

    Phases (in order, with portraits streaming after `complete`):
      counting → plan → event × N → finalizing → complete
      → portrait × ≤10 (interleaved with portrait_error)
    """
    form = await _read_form(request)
    p = _parse_profile(_require_str(form, "profile"))
    selfie_bytes, selfie_mime = await _read_selfie(form.get("selfie"))

    return StreamingResponse(
        _ndjson(stream_simulation(p, selfie_bytes, selfie_mime)),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/branch")
async def simulate_branch(request: Request) -> StreamingResponse:
    """Re-stream a simulation with a user intervention baked in.

    Pre-intervention checkpoints AND high portraits are preserved from the
    original simulation. Post-intervention years are re-planned. The low
    trajectory and its portraits are regenerated whole."""
    form = await _read_form(request)
    p = _parse_profile(_require_str(form, "profile"))
    try:
        intervention_year = int(_require_str(form, "intervention_year"))
    except ValueError:
        raise HTTPException(status_code=422, detail="intervention_year must be int")
    intervention_text = _require_str(form, "intervention_text")
    try:
        original = SimulationData.model_validate_json(
            _require_str(form, "original_simulation")
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"original_simulation: {e}")
    selfie_bytes, selfie_mime = await _read_selfie(form.get("selfie"))

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


async def _read_form(request: Request):
    try:
        return await request.form(max_part_size=MAX_PART_BYTES)
    except Exception as e:  # multipart parse errors surface as 400
        raise HTTPException(status_code=400, detail=f"form parse: {e}")


def _require_str(form, name: str) -> str:
    v = form.get(name)
    if not isinstance(v, str):
        raise HTTPException(status_code=422, detail=f"{name}: required string field")
    return v


def _parse_profile(raw: str) -> Profile:
    try:
        return Profile.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"profile: {e}")


async def _read_selfie(selfie) -> tuple[bytes | None, str]:
    if selfie is None or not isinstance(selfie, UploadFile):
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
