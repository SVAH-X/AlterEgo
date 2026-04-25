# Selfie Capture + Aged Portraits Across Both Trajectories

**Status:** Draft for review
**Date:** 2026-04-25
**Hackathon target:** LA Hacks 2026 judging 2026-04-26

## Goal

Let the user take (or upload) a selfie before intake, then render five photorealistic aged portraits per trajectory — ten total, anchored to the existing five-age timeline — using Google Gemini's image-generation API. Each portrait is conditioned on the cumulative life events the simulation has produced for that trajectory by that age, so a "10 years of 80-hour weeks" outcome should visibly show in the face (fatigue, eye-bags, posture).

## Non-goals (explicit YAGNI)

- No persistence of selfies or portraits server-side. Backend stays stateless.
- No selfie editing/cropping UI beyond capture and retake.
- No portrait per checkpoint (six events per trajectory) — five anchored years per trajectory only.
- No multi-face support. Assume one face in the selfie; if Gemini sees none, the portrait fails gracefully.
- No A/B prompt testing. Ship one prompt template, tune during demo prep.

## User flow

```
Landing → [NEW] Selfie → Intake → Processing → Reveal → Chat → Timeline → Slider → Encore
```

The new `Selfie` screen sits between the existing Landing CTA ("Upload a selfie", already in `frontend/src/screens/screens-a.tsx:55`) and the Intake wizard. It owns:

- Webcam capture as the primary path, via `getUserMedia({ video: true })` with a live preview and a snap-to-capture button.
- File upload as the fallback, via `<input type="file" accept="image/*" capture="user">`.
- Camera-permission denial swaps silently to the file-upload UI.
- "Use this photo / retake" confirmation step.
- Continue is disabled until a selfie is captured or uploaded.

The captured `Blob` lives in React state on `App` alongside `profile` and `simulation`. It is posted with every `/simulate` and `/simulate/branch` call (the branch endpoint also needs the selfie because the alternate trajectory may extend post-intervention).

## Data contract changes

### Replace `ages` with `agedPortraits`

The existing `SimulationData.ages: number[]` field is dead on the consumer side — audited across the frontend, zero readers. The Timeline screen (`screens-b.tsx:340`) re-derives age inline from `profile.age + (currentYear - startYear)` instead of reading `simulation.ages`. We replace it cleanly:

```ts
// frontend/src/types.ts
type Trajectory = "high" | "low";

interface AgedPortrait {
  age: number;
  year: number;
  trajectory: Trajectory;
  imageUrl: string | null;  // data:image/png;base64,... or null on failure
}

interface SimulationData {
  // ... existing fields, minus `ages` ...
  agedPortraits: AgedPortrait[];  // 10 entries: 5 high + 5 low
}
```

Mirror in `backend/app/models/simulation.py`, with a new `backend/app/models/portrait.py` for the `AgedPortrait` Pydantic model.

`frontend/src/data.ts` mock simulation gets 10 placeholder `agedPortraits` entries with `imageUrl: null` so screens render fallback states without hitting the API during development.

### Five anchor ages

Already computed by `_compute_ages(profile)` in `backend/app/services/orchestrator.py:447`:

```python
[profile.age + round(span * frac) for frac in (0.0, 0.25, 0.5, 0.75, 1.0)]
```

Same five anchors drive both trajectories' portraits.

## Backend: image_generator service

**New file:** `backend/app/services/image_generator.py`

Single public coroutine:

```python
async def generate_aged_portrait(
    selfie_bytes: bytes,
    selfie_mime: str,
    profile: Profile,
    target_age: int,
    target_year: int,
    trajectory: Trajectory,
    relevant_events: list[Checkpoint],  # cumulative: events with year <= target_year on this trajectory
) -> AgedPortrait
```

Calls Gemini's image-generation endpoint with the selfie as inline image input plus a constructed prompt. Returns `AgedPortrait` with `imageUrl` set to a `data:image/png;base64,...` URL on success, or `imageUrl=None` on failure (logged, not raised).

### Prompt template

Cumulative event context, weighted toward recent events by reverse-year ordering:

```
You are aging this person to {target_age} years old (year {target_year}).
Preserve their identity: bone structure, eye color, distinguishing features.

Profile context:
- Occupation: {profile.occupation}
- Sustained work intensity: {profile.workHours} hours/week
- Their stated fear: {profile.topFear}

Life events that shaped them (cumulative, most recent first):
- Year {year} (age {age}): {title}. {event} {consequence}
- ...

Render as a photorealistic portrait. The events should show in their face:
fatigue, weight changes, posture, hair, skin texture, the look in their eyes,
the clothing of someone living that life. Neutral background, soft natural light,
shoulders-up framing. Documentary-portrait aesthetic, consistent across all
images of this person.
```

Stored in `backend/app/prompts/portrait.py` for parity with existing prompts.

## Backend: orchestrator integration

`stream_simulation()` in `backend/app/services/orchestrator.py` gains a parallel side-channel:

1. Existing phases run unchanged: `counting → plan → event × N → finalizing → complete`.
2. As soon as `_finalize` and `_alternate` complete (point at which both `checkpointsHigh` and `checkpointsLow` are known), kick off ten `generate_aged_portrait` tasks via `asyncio.gather` — five high + five low — using `_compute_ages(profile)` for the anchor ages/years.
3. As each portrait completes, emit a new NDJSON event:
   ```json
   {"phase": "portrait", "trajectory": "high", "index": 2, "portrait": {...AgedPortrait}}
   ```
4. The final `complete` payload includes whatever portraits have already finished. The remaining ones stream in afterward; the client merges by `(trajectory, index)`.

For `stream_branched_simulation`: the five anchor ages are deterministic from the profile and do not change on branch. Pre-intervention high portraits — those whose `year < intervention.year` — are preserved verbatim from `original_simulation.agedPortraits` and re-emitted with their original indices. High portraits with `year >= intervention.year` are re-generated against the rebranched checkpoints. All five low portraits are re-generated, because the low trajectory is regenerated whole by the existing `_alternate()` step. Mirrors the existing kept-checkpoint logic at `orchestrator.py:245`.

If a single portrait gen fails, emit it with `imageUrl: null` plus a sibling telemetry event:
```json
{"phase": "portrait_error", "trajectory": "high", "index": 2, "message": "..."}
```
Other portraits proceed independently.

## Backend: endpoint signature changes

Both `/simulate` and `/simulate/branch` switch from JSON body to `multipart/form-data`:

```python
@router.post("")
async def simulate(
    profile: str = Form(...),       # JSON string, parsed to Profile
    selfie: UploadFile = File(...),
) -> StreamingResponse:
    p = Profile.model_validate_json(profile)
    selfie_bytes = await selfie.read()
    return StreamingResponse(
        _ndjson(stream_simulation(p, selfie_bytes, selfie.content_type)),
        media_type="application/x-ndjson",
        ...
    )
```

The branch endpoint accepts the same plus the existing `intervention_year`, `intervention_text`, and `original_simulation` fields as additional form parts (each as JSON strings parsed into Pydantic models).

`UploadFile` rather than embedding the file in a Pydantic model because FastAPI does not compose `File`/`Form` cleanly with model bodies.

## Frontend rendering

| Screen | Portrait usage |
|---|---|
| **Selfie** (new, `screens/screen-selfie.tsx`, ~150 LOC) | Webcam preview → snap/retake → confirm. Stores `Blob` in App state. |
| **Processing** | Existing phase indicator gets a "rendering portraits" line that fills in as `phase: "portrait"` events stream. |
| **Reveal / Chat** | Use the final-year `high` portrait as the "future you" hero image. |
| **Timeline** | Each checkpoint card looks up the nearest `agedPortrait` by absolute year-distance on the active trajectory. If the closest portrait is within 3 years of the checkpoint's year, render it as a watermark/inset; otherwise the card stays text-only. |
| **Slider** | The killer demo moment: two faces side-by-side, one per trajectory, swap as the user drags. The 5-position slider snaps to the five portrait years. |

## Settings

Add to `backend/app/config.py`:

```python
gemini_api_key: str | None = None
gemini_image_model: str = "gemini-2.5-flash-image"
```

`gemini_api_key` absent ⇒ portraits silently skipped; `agedPortraits=[]` in the response; UI degrades to text-only. The hackathon demo still works without the key (useful for offline dev and judge-shy backups).

`gemini_image_model` is overridable per environment so cheaper models can be used during development and the demo-quality model only on demo day.

Add to `.env.example`:

```
GEMINI_API_KEY=
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

## Failure modes & graceful degradation

| Failure | Behavior |
|---|---|
| `GEMINI_API_KEY` not set | `/simulate` runs normally, `agedPortraits=[]`, UI hides portrait surfaces (Timeline/Slider degrade to text-only). |
| Single portrait gen fails | `imageUrl=null`, UI falls back to selfie + caption "couldn't render this year". Other 9 unaffected. |
| All portraits fail | Same as no key — text-only experience. |
| User denies camera permission | Selfie screen swaps to file upload silently. |
| User submits no selfie | Continue button stays disabled. No path through the app without a selfie. |
| Selfie larger than 5MB | Client-side downscale to max 1024px on longest edge before upload (canvas resample). |

## Privacy

The selfie screen displays one line beneath the capture UI:

> Your photo is sent to Gemini to generate the portraits. Nothing is saved on our servers.

Selfie bytes live only in the request scope (in-memory) on the backend, are forwarded to Gemini, and are dropped when the request ends. Generated portraits live only in client memory once the frontend has them.

## File-by-file change summary

**New files:**
- `backend/app/services/image_generator.py` — Gemini call + prompt construction
- `backend/app/prompts/portrait.py` — prompt template
- `backend/app/models/portrait.py` — `AgedPortrait` Pydantic model + `Trajectory` literal
- `frontend/src/screens/screen-selfie.tsx` — webcam + upload UI
- `.env.example` updates (new keys)

**Modified files:**
- `backend/app/api/simulate.py` — multipart endpoints, pass selfie to orchestrator
- `backend/app/services/orchestrator.py` — fan-out portrait gen + new NDJSON phases; preserve-on-branch logic
- `backend/app/models/simulation.py` — drop `ages`, add `agedPortraits`
- `backend/app/config.py` — Gemini settings
- `frontend/src/types.ts` — drop `ages`, add `AgedPortrait` + `Trajectory`
- `frontend/src/data.ts` — mock `agedPortraits`
- `frontend/src/App.tsx` — add `selfie: Blob | null` state, add Selfie to SCREENS, pass to props
- `frontend/src/screens/screens-a.tsx` — Landing CTA continues to Selfie (already does — no change beyond label)
- `frontend/src/screens/screens-b.tsx` — Timeline portrait insets, Slider side-by-side faces
- `frontend/src/lib/` — new `useSimulateStream` (or extend the existing simulate client) to handle `phase: "portrait"` events and merge into simulation state

## Open questions for review

None known at draft time. Reviewer should challenge:
- Whether portrait scope (5 per trajectory) should expand to per-checkpoint after seeing the first results.
- Whether the prompt template's documentary-portrait aesthetic is the right look or if a more cinematic style would land harder for the demo.
- Whether the slider's 5-position snap is the right interaction or if free-drag with portrait crossfade reads better.
