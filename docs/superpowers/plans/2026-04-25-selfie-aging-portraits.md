# Selfie + Aged Portraits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selfie capture step before intake, then stream ten Gemini-generated aged portraits (5 high + 5 low trajectory) inside `/simulate`, and surface them on the Processing, Reveal, Chat, Timeline, and Slider screens.

**Architecture:** New `Selfie` screen captures a `Blob` into App state. The simulate endpoints switch to `multipart/form-data` to carry the selfie alongside the existing JSON payload. The orchestrator fans out 10 parallel Gemini image-gen tasks after `_finalize` + `_alternate` complete and emits each as a new NDJSON `phase: "portrait"` event. Frontend merges portrait events into `simulation.agedPortraits` as they arrive.

**Tech Stack:** FastAPI + `python-multipart` + `google-genai` SDK on the backend; React 18 + Vite + `getUserMedia()` on the frontend.

**Spec:** [`docs/superpowers/specs/2026-04-25-selfie-aging-portraits-design.md`](../specs/2026-04-25-selfie-aging-portraits-design.md)

---

## Conventions used in this plan

- All paths absolute from repo root unless prefixed with `./`.
- Backend tests use `pytest` from `backend/` (existing pattern in `backend/tests/test_health.py`).
- Run backend tests with: `cd backend && .venv/bin/pytest tests/<file> -v`
- Run frontend dev server with: `cd frontend && npm run dev` (verify in browser; this codebase has no frontend test setup, so frontend tasks use manual verification).
- After every task, commit with the conventional-commit message shown in the final step of that task.

---

## Post-review amendments (READ FIRST)

Three independent reviews surfaced six issues. The fixes below are now **mandatory parts** of their referenced tasks — if a task body and an amendment conflict, follow the amendment.

### A1 (Critical) — Patch orchestrator call sites in Task 2

Task 2 drops `ages` from `SimulationData`. The existing `orchestrator.py` constructs `SimulationData(... ages=_compute_ages(profile) ...)` at `backend/app/services/orchestrator.py:96-103` and `:267-274`. Without a simultaneous patch, the tree is broken between Task 2's commit and Task 6's. **In Task 2 Step 4, also edit both call sites** to use `agedPortraits=[]` (placeholder; Task 6 fills it via streaming):

```python
sim = SimulationData(
    profile=profile,
    agedPortraits=[],
    checkpointsHigh=completed,
    checkpointsLow=alternate_cps,
    futureSelfOpening=final_payload["futureSelfOpening"],
    futureSelfReplies=final_payload["futureSelfReplies"],
)
```

Add the changed file path to Task 2 Step 8's `git add`.

### A2 (Critical) — Lift the simulate stream consumer to App.tsx

The existing Processing screen (`screens-a.tsx:367-441`) runs the `for await` loop in its own `useEffect` and only calls `onContinue` after the stream **fully closes**. With portraits streaming after `phase: "complete"`, this means: either (a) the user sits on Processing until all 10 portraits land (defeats background streaming), or (b) if Processing is unmounted by manual advance or auto-advance, the loop's `cancelled = true` cleanup aborts the stream and remaining portraits are lost.

**Fix architecture:** move the stream consumer to App.tsx so it survives screen transitions.

**Replaces Task 12 entirely.** Re-do Task 12 as follows:

1. In `App.tsx`, add a new function `runSimulate(profile, selfie)` that consumes `simulateStream` and dispatches state updates. It must keep running after screen transitions (don't cancel on Processing unmount).
2. Add a new App-level setter `mergePortrait(portrait: AgedPortrait)` that appends to `simulation.agedPortraits` **without** the side effect that resets `timelineViewed` (see A3 below).
3. Add new App state `simStreamPhase: 'idle' | 'streaming' | 'complete' | 'error'` and `portraitsDone: number`. Pass both to `ScreenProps`.
4. The Processing screen no longer owns a `for await` loop. It reads `simStreamPhase` and `portraitsDone` from props and renders the existing phase indicators plus the "rendering portraits · N/10" line. It calls `onContinue` as soon as `simStreamPhase === 'complete'` (after the existing minimum-display delay).
5. Trigger `runSimulate(profile, selfie)` from Intake's last-field submit (or from Processing's mount, but only if no consumer is already running — guard with a ref).
6. The existing local Processing state (`agentCount`, `outline`, `latestTitle`, `phase`) lifts into App or gets exposed via the new App state.

This is more invasive than the original Task 12 — the executor should plan a separate commit per moved concern (1: lift consumer; 2: add `mergePortrait`; 3: rewire Processing to read state).

### A3 (Critical) — Add `mergePortrait` setter, don't use `setSimulation` for portraits

`App.tsx:79` defines `setSimulation = (s) => { setSimulationState(s); setTimelineViewed(false); }` — a value-only setter that resets `timelineViewed` on every call. Task 12's original `setSimulation((sim) => ...)` would (a) crash because it's not a function-setter, and (b) wipe the "viewed" flag on every portrait merge, breaking the timeline auto-play state.

**Add a separate setter:**

```typescript
const mergePortrait = (portrait: AgedPortrait) => {
  setSimulationState((sim) => sim ? { ...sim, agedPortraits: [...sim.agedPortraits, portrait] } : sim);
};
```

Note: `setSimulationState` (the raw `useState` setter) accepts a function form. `setSimulation` (the wrapped one) doesn't, and you don't want its side effect anyway.

Add `mergePortrait: (p: AgedPortrait) => void` to `ScreenProps` (still pass through to all screens for type consistency, but only the Processing screen will call it via the lifted consumer in App — see A2).

### A4 (Should-fix) — Short-circuit portrait fan-out when `GEMINI_API_KEY` is unset

Spec says "no key ⇒ silently skipped, `agedPortraits=[]`." Task 6's current behavior calls Gemini per portrait; each raises `RuntimeError("GEMINI_API_KEY not set")`, which logs a warning AND emits a `portrait_error` event. Ten errors is not silent.

**In Task 6 Step 3c**, before the `async for ev in _fan_out_portraits(...)` block, gate on the key:

```python
settings_local = get_settings()
if selfie_bytes and settings_local.gemini_api_key:
    async for ev in _fan_out_portraits(
        profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
        high=completed, low=alternate_cps, ages=ages,
    ):
        yield ev
```

Same pattern in `stream_branched_simulation` from Task 7 Step 4.

### A5 (Should-fix) — File-upload size cap missing in Selfie screen

Task 10's `onFileChosen` stores the raw `File` blob with no resample. A 12 MB upload from disk goes straight through. Spec says >5MB → downscale to 1024 longest edge.

**Replace Task 10's `onFileChosen` with:**

```typescript
function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const longest = Math.max(img.width, img.height);
    const scale = longest > 1024 ? 1024 / longest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return;
        setState({ kind: "preview", blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.9,
    );
  };
  img.src = url;
}
```

### A6 (Should-fix) — Two CSS classes don't exist

`frontend/src/styles.css` has `.btn`, `.btn-accent`, `.serif`, `.muted`, `.mono` but **not** `.btn-link` or `.screen-pad`. Task 10 references both.

**In Task 10**, replace those classes with inline equivalents:
- `.screen-pad` wrapper → drop the className; the existing `style={{ display: "flex", ... minHeight: "100vh" }}` is sufficient.
- `.btn-link` (back button) → use `.btn` with style override `{ background: "transparent", border: "none", color: "var(--ink-2)" }`.

Alternative: add the two classes to `frontend/src/styles.css` in a new sub-step before Step 3 of Task 10. Pick whichever you prefer — both keep the codebase consistent.

### Minor (no plan edit required)

- Task 7's `by_index_high` lookup is O(n²) and stores an unused tuple. Functionally correct; simplify to `by_year_high = {p.year: p for p in original_portraits if p.trajectory == "high"}` if you notice it during execution.
- Task 6's `complete` payload always carries `agedPortraits=[]` and never includes mid-flight portraits. Spec ambiguously suggested racing; the simpler "always-empty in `complete`, all portraits stream after" is fine — frontend appends.

---

## Task 1: Add Gemini SDK, settings, and env vars

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`
- Modify: `.env.example`

- [ ] **Step 1: Add `google-genai` to backend deps**

Append to `backend/requirements.txt` immediately after the `elevenlabs` line:

```
google-genai>=0.3
```

- [ ] **Step 2: Install the new dep**

Run from repo root:
```
cd backend && .venv/bin/pip install -r requirements.txt
```
Expected: `google-genai` installs without errors.

- [ ] **Step 3: Add Gemini settings to `Settings` class**

In `backend/app/config.py`, add these two fields after the ElevenLabs block (just above `# Server`):

```python
    # Gemini (image generation for aged portraits)
    # Absent api_key ⇒ portraits are silently skipped (agedPortraits=[]); the
    # rest of /simulate works unchanged.
    gemini_api_key: str = ""
    gemini_image_model: str = "gemini-2.5-flash-image"
```

- [ ] **Step 4: Add the same keys to `.env.example`**

Append to `.env.example` immediately after the ElevenLabs block:

```
# --- Gemini (image generation for aged portraits) ---
# Use a cheaper image model during dev, the polished one on demo day.
GEMINI_API_KEY=
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

- [ ] **Step 5: Verify backend still starts**

Run from repo root: `cd backend && .venv/bin/python -c "from app.main import app; print(app.title)"`
Expected: prints `AlterEgo` with no import errors.

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/config.py .env.example
git commit -m "feat(config): add Gemini image-gen settings + env keys"
```

---

## Task 2: Add `AgedPortrait` Pydantic model and update `SimulationData`

**Files:**
- Create: `backend/app/models/portrait.py`
- Modify: `backend/app/models/simulation.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_portrait_model.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_portrait_model.py`:

```python
from app.models import AgedPortrait, SimulationData, Profile, Checkpoint


def test_aged_portrait_validates() -> None:
    p = AgedPortrait(
        age=52, year=2046, trajectory="high",
        imageUrl="data:image/png;base64,AAAA",
    )
    assert p.trajectory == "high"
    assert p.imageUrl is not None


def test_aged_portrait_allows_null_image_url() -> None:
    p = AgedPortrait(age=52, year=2046, trajectory="low", imageUrl=None)
    assert p.imageUrl is None


def test_simulation_data_accepts_aged_portraits() -> None:
    profile = Profile(
        name="x", age=32, occupation="x", workHours=40,
        topGoal="x", topFear="x", targetYear=2046, presentYear=2026,
    )
    cp = Checkpoint(year=2030, age=36, title="t", event="e", did="d", consequence="c")
    sim = SimulationData(
        profile=profile,
        agedPortraits=[
            AgedPortrait(age=32, year=2026, trajectory="high", imageUrl=None),
        ],
        checkpointsHigh=[cp],
        checkpointsLow=[cp],
        futureSelfOpening="hi",
        futureSelfReplies={"a": "b"},
    )
    assert len(sim.agedPortraits) == 1
    # The old `ages` field must NOT be on the model anymore.
    assert "ages" not in sim.model_fields
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_portrait_model.py -v`
Expected: import error or AttributeError on `AgedPortrait` not existing.

- [ ] **Step 3: Create `backend/app/models/portrait.py`**

```python
from typing import Literal, Optional

from pydantic import BaseModel

Trajectory = Literal["high", "low"]


class AgedPortrait(BaseModel):
    """One aged portrait of the user at a specific year on a trajectory.

    `imageUrl` is a `data:image/png;base64,...` URL when generation
    succeeded, or `None` when generation failed (the UI degrades to the
    original selfie or text-only).
    """

    age: int
    year: int
    trajectory: Trajectory
    imageUrl: Optional[str] = None
```

- [ ] **Step 4: Update `SimulationData`**

Replace `backend/app/models/simulation.py` with:

```python
from pydantic import BaseModel

from app.models.checkpoint import Checkpoint
from app.models.portrait import AgedPortrait
from app.models.profile import Profile


class SimulationData(BaseModel):
    """Mirrors frontend `src/types.ts` SimulationData exactly.

    The single object returned by POST /simulate. The frontend stores it and
    drives all eight screens from this payload.
    """

    profile: Profile
    agedPortraits: list[AgedPortrait]            # 10 entries: 5 high + 5 low
    checkpointsHigh: list[Checkpoint]            # current-trajectory path (6 cards)
    checkpointsLow: list[Checkpoint]             # alternate-hours path (6 cards)
    futureSelfOpening: str                       # 25–50 word voiced reveal line
    futureSelfReplies: dict[str, str]            # 3 canned Q→A pairs
```

- [ ] **Step 5: Export new types from `models/__init__.py`**

Replace `backend/app/models/__init__.py` with:

```python
from app.models.chat import ChatMessage, ChatRequest, ChatResponse
from app.models.checkpoint import Checkpoint, Tone
from app.models.portrait import AgedPortrait, Trajectory
from app.models.profile import Profile
from app.models.simulation import SimulationData

__all__ = [
    "AgedPortrait",
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "Checkpoint",
    "Profile",
    "SimulationData",
    "Tone",
    "Trajectory",
]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_portrait_model.py -v`
Expected: all 3 tests PASS.

- [ ] **Step 7: Verify health endpoint still works**

Run: `cd backend && .venv/bin/pytest tests/test_health.py -v`
Expected: PASS (no regression).

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/portrait.py backend/app/models/simulation.py backend/app/models/__init__.py backend/tests/test_portrait_model.py
git commit -m "feat(models): replace ages with agedPortraits + AgedPortrait type"
```

---

## Task 3: Mirror types in frontend + update mock data

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/data.ts`

- [ ] **Step 1: Update `frontend/src/types.ts`**

Replace the file's contents with:

```typescript
export type Tone = "neutral" | "warn" | "good";
export type Trajectory = "high" | "low";

export interface Profile {
  name: string;
  age: number;
  occupation: string;
  workHours: number;
  topGoal: string;
  topFear: string;
  targetYear: number;
  presentYear: number;
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

export interface SimulationData {
  profile: Profile;
  agedPortraits: AgedPortrait[];
  checkpointsHigh: Checkpoint[];
  checkpointsLow: Checkpoint[];
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
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

- [ ] **Step 2: Update mock data**

In `frontend/src/data.ts`, replace the line `ages: [32, 38, 45, 52, 56],` with:

```typescript
  agedPortraits: [
    { age: 32, year: 2026, trajectory: "high", imageUrl: null },
    { age: 37, year: 2031, trajectory: "high", imageUrl: null },
    { age: 42, year: 2036, trajectory: "high", imageUrl: null },
    { age: 47, year: 2041, trajectory: "high", imageUrl: null },
    { age: 52, year: 2046, trajectory: "high", imageUrl: null },
    { age: 32, year: 2026, trajectory: "low", imageUrl: null },
    { age: 37, year: 2031, trajectory: "low", imageUrl: null },
    { age: 42, year: 2036, trajectory: "low", imageUrl: null },
    { age: 47, year: 2041, trajectory: "low", imageUrl: null },
    { age: 52, year: 2046, trajectory: "low", imageUrl: null },
  ],
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors. (If errors mention `simulation.ages` anywhere — they shouldn't, per the audit — fix at the call site.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/data.ts
git commit -m "feat(types): mirror agedPortraits + AgedPortrait + portrait stream events"
```

---

## Task 4: Write the portrait prompt template

**Files:**
- Create: `backend/app/prompts/portrait.py`

- [ ] **Step 1: Create the prompt module**

Create `backend/app/prompts/portrait.py`:

```python
from app.models import Checkpoint, Profile, Trajectory


def render_portrait_prompt(
    profile: Profile,
    target_age: int,
    target_year: int,
    trajectory: Trajectory,
    relevant_events: list[Checkpoint],
) -> str:
    """Construct the Gemini image-edit prompt for one aged portrait.

    `relevant_events` is cumulative: every checkpoint on this trajectory with
    year <= target_year, ordered most-recent-first so the prompt weights the
    latest stress visibly."""
    events_block = (
        "\n".join(
            f"- Year {e.year} (age {e.age}): {e.title}. {e.event} {e.consequence}"
            for e in sorted(relevant_events, key=lambda e: -e.year)
        )
        or "- (no major events yet — show them roughly as they look today, age-progressed only)"
    )

    return (
        f"You are aging this person to {target_age} years old (year {target_year}).\n"
        "Preserve their identity: bone structure, eye color, distinguishing features.\n\n"
        "Profile context:\n"
        f"- Occupation: {profile.occupation}\n"
        f"- Sustained work intensity: {profile.workHours} hours/week\n"
        f"- Their stated fear: {profile.topFear}\n\n"
        "Life events that shaped them (cumulative, most recent first):\n"
        f"{events_block}\n\n"
        "Render as a photorealistic portrait. The events should show in their face: "
        "fatigue, weight changes, posture, hair, skin texture, the look in their eyes, "
        "the clothing of someone living that life. Neutral background, soft natural light, "
        "shoulders-up framing. Documentary-portrait aesthetic, consistent across all "
        f"images of this person. Trajectory: {trajectory}."
    )
```

- [ ] **Step 2: Sanity check it imports**

Run: `cd backend && .venv/bin/python -c "from app.prompts.portrait import render_portrait_prompt; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/prompts/portrait.py
git commit -m "feat(prompts): add portrait prompt template"
```

---

## Task 5: Build the `image_generator` service (TDD)

**Files:**
- Create: `backend/app/services/image_generator.py`
- Test: `backend/tests/test_image_generator.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_image_generator.py`:

```python
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import AgedPortrait, Checkpoint, Profile
from app.services.image_generator import generate_aged_portrait


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def _checkpoint(year: int, age: int) -> Checkpoint:
    return Checkpoint(
        year=year, age=age, title="t", event="e", did="d", consequence="c",
    )


@pytest.mark.asyncio
async def test_generate_aged_portrait_returns_data_url_on_success() -> None:
    fake_image_bytes = b"\x89PNG\r\n\x1a\nfake"
    fake_response = MagicMock()
    fake_part = MagicMock()
    fake_part.inline_data = MagicMock(data=fake_image_bytes, mime_type="image/png")
    fake_part.text = None
    fake_response.candidates = [MagicMock(content=MagicMock(parts=[fake_part]))]

    with patch("app.services.image_generator._call_gemini", new=AsyncMock(return_value=fake_response)):
        portrait = await generate_aged_portrait(
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
            profile=_profile(),
            target_age=42,
            target_year=2036,
            trajectory="high",
            relevant_events=[_checkpoint(2030, 36)],
        )

    assert isinstance(portrait, AgedPortrait)
    assert portrait.age == 42
    assert portrait.year == 2036
    assert portrait.trajectory == "high"
    assert portrait.imageUrl is not None
    assert portrait.imageUrl.startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_generate_aged_portrait_returns_null_url_on_failure() -> None:
    with patch("app.services.image_generator._call_gemini", new=AsyncMock(side_effect=RuntimeError("boom"))):
        portrait = await generate_aged_portrait(
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
            profile=_profile(),
            target_age=42,
            target_year=2036,
            trajectory="low",
            relevant_events=[],
        )

    assert portrait.imageUrl is None
    assert portrait.trajectory == "low"


@pytest.mark.asyncio
async def test_generate_aged_portrait_returns_null_when_no_image_in_response() -> None:
    fake_response = MagicMock()
    fake_part = MagicMock()
    fake_part.inline_data = None
    fake_part.text = "I cannot generate that image."
    fake_response.candidates = [MagicMock(content=MagicMock(parts=[fake_part]))]

    with patch("app.services.image_generator._call_gemini", new=AsyncMock(return_value=fake_response)):
        portrait = await generate_aged_portrait(
            selfie_bytes=b"selfie",
            selfie_mime="image/jpeg",
            profile=_profile(),
            target_age=42,
            target_year=2036,
            trajectory="high",
            relevant_events=[],
        )

    assert portrait.imageUrl is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_image_generator.py -v`
Expected: import error on `app.services.image_generator`.

- [ ] **Step 3: Create the service**

Create `backend/app/services/image_generator.py`:

```python
"""Gemini image generation for aged portraits.

One public coroutine: `generate_aged_portrait`. Failures never raise — they
return an `AgedPortrait` with `imageUrl=None` so the orchestrator can stream
the failure as a `portrait_error` phase and continue with the rest.
"""

import asyncio
import base64
import logging
from typing import Any

from app.config import get_settings
from app.models import AgedPortrait, Checkpoint, Profile, Trajectory
from app.prompts.portrait import render_portrait_prompt

logger = logging.getLogger(__name__)


async def generate_aged_portrait(
    selfie_bytes: bytes,
    selfie_mime: str,
    profile: Profile,
    target_age: int,
    target_year: int,
    trajectory: Trajectory,
    relevant_events: list[Checkpoint],
) -> AgedPortrait:
    """Generate one aged portrait. Returns AgedPortrait with imageUrl=None on
    any failure (logged, not raised)."""
    prompt = render_portrait_prompt(
        profile=profile,
        target_age=target_age,
        target_year=target_year,
        trajectory=trajectory,
        relevant_events=relevant_events,
    )

    try:
        response = await _call_gemini(prompt, selfie_bytes, selfie_mime)
        image_bytes, mime = _extract_image(response)
    except Exception as e:  # noqa: BLE001 — surface nothing to the caller; degrade
        logger.warning(
            "portrait gen failed for age=%d year=%d trajectory=%s: %s",
            target_age, target_year, trajectory, e,
        )
        return AgedPortrait(age=target_age, year=target_year, trajectory=trajectory, imageUrl=None)

    if image_bytes is None:
        logger.warning(
            "portrait gen returned no image for age=%d year=%d trajectory=%s",
            target_age, target_year, trajectory,
        )
        return AgedPortrait(age=target_age, year=target_year, trajectory=trajectory, imageUrl=None)

    b64 = base64.b64encode(image_bytes).decode("ascii")
    return AgedPortrait(
        age=target_age,
        year=target_year,
        trajectory=trajectory,
        imageUrl=f"data:{mime};base64,{b64}",
    )


async def _call_gemini(prompt: str, selfie_bytes: bytes, selfie_mime: str) -> Any:
    """Thin wrapper around the google-genai SDK. Patched in tests."""
    from google import genai
    from google.genai import types

    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=settings.gemini_api_key)

    # google-genai is sync; offload to a thread to keep the event loop free.
    return await asyncio.to_thread(
        client.models.generate_content,
        model=settings.gemini_image_model,
        contents=[
            types.Part.from_bytes(data=selfie_bytes, mime_type=selfie_mime),
            prompt,
        ],
    )


def _extract_image(response: Any) -> tuple[bytes | None, str]:
    """Pull the first inline image out of a Gemini response. Returns
    (image_bytes, mime) — image_bytes is None when the response carries no
    image (e.g. the model refused or returned only text)."""
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            inline = getattr(part, "inline_data", None)
            if inline is not None and getattr(inline, "data", None):
                return inline.data, getattr(inline, "mime_type", "image/png") or "image/png"
    return None, "image/png"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_image_generator.py -v`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/image_generator.py backend/tests/test_image_generator.py
git commit -m "feat(services): add Gemini-backed image_generator with graceful failure"
```

---

## Task 6: Wire portrait fan-out into `stream_simulation`

**Files:**
- Modify: `backend/app/services/orchestrator.py`
- Test: `backend/tests/test_orchestrator_portraits.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_orchestrator_portraits.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from app.models import AgedPortrait, Checkpoint, Profile
from app.services.orchestrator import _fan_out_portraits


def _profile() -> Profile:
    return Profile(
        name="Sam", age=32, occupation="lawyer", workHours=80,
        topGoal="x", topFear="y", targetYear=2046, presentYear=2026,
    )


def _cps() -> list[Checkpoint]:
    return [
        Checkpoint(year=y, age=32 + (y - 2026), title="t", event="e", did="d", consequence="c")
        for y in (2028, 2031, 2034, 2038, 2042, 2046)
    ]


@pytest.mark.asyncio
async def test_fan_out_portraits_emits_one_event_per_anchor() -> None:
    """fan_out_portraits emits exactly 10 portrait events (5 high + 5 low),
    one per (trajectory, index)."""
    async def fake_gen(*, target_age, target_year, trajectory, **_kwargs):
        return AgedPortrait(
            age=target_age, year=target_year, trajectory=trajectory,
            imageUrl=f"data:image/png;base64,FAKE-{trajectory}-{target_age}",
        )

    high = _cps()
    low = _cps()

    with patch("app.services.orchestrator.generate_aged_portrait", new=AsyncMock(side_effect=fake_gen)):
        events = []
        async for ev in _fan_out_portraits(
            profile=_profile(), selfie_bytes=b"x", selfie_mime="image/jpeg",
            high=high, low=low, ages=[32, 37, 42, 47, 52],
        ):
            events.append(ev)

    portrait_events = [e for e in events if e["phase"] == "portrait"]
    assert len(portrait_events) == 10
    high_events = [e for e in portrait_events if e["trajectory"] == "high"]
    low_events = [e for e in portrait_events if e["trajectory"] == "low"]
    assert len(high_events) == 5
    assert len(low_events) == 5
    assert {e["index"] for e in high_events} == {0, 1, 2, 3, 4}


@pytest.mark.asyncio
async def test_fan_out_portraits_emits_portrait_error_on_null_url() -> None:
    async def fake_gen(*, target_age, target_year, trajectory, **_kwargs):
        return AgedPortrait(age=target_age, year=target_year, trajectory=trajectory, imageUrl=None)

    with patch("app.services.orchestrator.generate_aged_portrait", new=AsyncMock(side_effect=fake_gen)):
        events = []
        async for ev in _fan_out_portraits(
            profile=_profile(), selfie_bytes=b"x", selfie_mime="image/jpeg",
            high=_cps(), low=_cps(), ages=[32, 37, 42, 47, 52],
        ):
            events.append(ev)

    error_events = [e for e in events if e["phase"] == "portrait_error"]
    assert len(error_events) == 10  # all failed -> all error events
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_orchestrator_portraits.py -v`
Expected: ImportError on `_fan_out_portraits` not existing.

- [ ] **Step 3: Update `stream_simulation` signature and add `_fan_out_portraits`**

In `backend/app/services/orchestrator.py`:

3a. Add the import near the other service imports (after the `event_pool` import):

```python
from app.services.image_generator import generate_aged_portrait
```

3b. Change the `stream_simulation` signature to accept the selfie:

```python
async def stream_simulation(
    profile: Profile,
    selfie_bytes: bytes | None = None,
    selfie_mime: str = "image/jpeg",
    intervention: Optional[dict] = None,
) -> AsyncIterator[dict]:
```

3c. After the `yield {"phase": "complete", ...}` line, replace the assembly block (currently emitting `ages=_compute_ages(profile)`) with:

```python
        ages = _compute_ages(profile)
        sim = SimulationData(
            profile=profile,
            agedPortraits=[],  # filled in by streamed portrait events
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
        yield {"phase": "complete", "simulation": sim.model_dump()}

        # Portrait fan-out runs AFTER complete: the frontend has the full
        # simulation skeleton and merges portraits into it as they arrive.
        if selfie_bytes:
            async for ev in _fan_out_portraits(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, low=alternate_cps, ages=ages,
            ):
                yield ev
```

3d. Add `_fan_out_portraits` at the bottom of the file, just above `_compute_ages`:

```python
async def _fan_out_portraits(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    high: list[Checkpoint],
    low: list[Checkpoint],
    ages: list[int],
) -> AsyncIterator[dict]:
    """Fire one Gemini call per (trajectory, anchor) — 10 total — and yield
    each result as it lands. Failures are emitted as 'portrait_error' events.
    Successes are emitted as 'portrait' events with the AgedPortrait inline."""
    span = profile.targetYear - profile.presentYear

    def _events_up_to(cps: list[Checkpoint], year: int) -> list[Checkpoint]:
        return [c for c in cps if c.year <= year]

    async def _one(index: int, age: int, trajectory: str, source: list[Checkpoint]) -> dict:
        year = profile.presentYear + round(span * (index / 4))
        portrait = await generate_aged_portrait(
            selfie_bytes=selfie_bytes,
            selfie_mime=selfie_mime,
            profile=profile,
            target_age=age,
            target_year=year,
            trajectory=trajectory,  # type: ignore[arg-type]
            relevant_events=_events_up_to(source, year),
        )
        if portrait.imageUrl is None:
            return {
                "phase": "portrait_error",
                "trajectory": trajectory,
                "index": index,
                "message": "image generation failed",
            }
        return {
            "phase": "portrait",
            "trajectory": trajectory,
            "index": index,
            "portrait": portrait.model_dump(),
        }

    tasks = []
    for i, age in enumerate(ages):
        tasks.append(asyncio.create_task(_one(i, age, "high", high)))
        tasks.append(asyncio.create_task(_one(i, age, "low", low)))

    for coro in asyncio.as_completed(tasks):
        yield await coro
```

- [ ] **Step 4: Update branched-stream-only assembly likewise**

Locate the `stream_branched_simulation` function. Change its `SimulationData(...)` call from `ages=_compute_ages(profile)` to `agedPortraits=[]` (preserving the rest):

```python
        sim = SimulationData(
            profile=profile,
            agedPortraits=[],
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

(The full branched portrait logic comes in Task 7.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_orchestrator_portraits.py tests/test_portrait_model.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/orchestrator.py backend/tests/test_orchestrator_portraits.py
git commit -m "feat(orchestrator): fan out 10 portrait gens after /simulate completes"
```

---

## Task 7: Branched-stream portrait preservation + regen

**Files:**
- Modify: `backend/app/services/orchestrator.py`
- Test: `backend/tests/test_orchestrator_portraits.py`

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_orchestrator_portraits.py`:

```python
from app.services.orchestrator import _fan_out_portraits_branched


@pytest.mark.asyncio
async def test_branched_portrait_fanout_preserves_pre_intervention_high() -> None:
    """High portraits with year < intervention.year are re-emitted verbatim
    from the original simulation; high portraits at/after the intervention
    year are regenerated; all 5 low portraits are regenerated."""
    profile = _profile()
    ages = [32, 37, 42, 47, 52]
    span = profile.targetYear - profile.presentYear  # 20

    original_high = [
        AgedPortrait(
            age=a, year=profile.presentYear + round(span * (i / 4)),
            trajectory="high", imageUrl=f"data:image/png;base64,ORIGINAL-{i}",
        )
        for i, a in enumerate(ages)
    ]

    intervention = {"year": 2036, "text": "I quit"}  # cuts at index 2 (age 42)

    async def fake_gen(*, target_age, target_year, trajectory, **_kwargs):
        return AgedPortrait(
            age=target_age, year=target_year, trajectory=trajectory,
            imageUrl=f"data:image/png;base64,REGEN-{trajectory}-{target_age}",
        )

    with patch("app.services.orchestrator.generate_aged_portrait", new=AsyncMock(side_effect=fake_gen)):
        events = []
        async for ev in _fan_out_portraits_branched(
            profile=profile, selfie_bytes=b"x", selfie_mime="image/jpeg",
            high=_cps(), low=_cps(), ages=ages,
            intervention=intervention,
            original_portraits=original_high,
        ):
            events.append(ev)

    high_events = [e for e in events if e["phase"] == "portrait" and e["trajectory"] == "high"]
    low_events = [e for e in events if e["phase"] == "portrait" and e["trajectory"] == "low"]
    assert len(high_events) == 5
    assert len(low_events) == 5
    # Indices 0 and 1 (years 2026, 2031) are pre-intervention -> preserved.
    preserved = [e for e in high_events if e["index"] in (0, 1)]
    assert all("ORIGINAL" in e["portrait"]["imageUrl"] for e in preserved)
    # Indices 2,3,4 are at/after intervention.year -> regenerated.
    regen = [e for e in high_events if e["index"] in (2, 3, 4)]
    assert all("REGEN" in e["portrait"]["imageUrl"] for e in regen)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_orchestrator_portraits.py::test_branched_portrait_fanout_preserves_pre_intervention_high -v`
Expected: ImportError on `_fan_out_portraits_branched`.

- [ ] **Step 3: Add `_fan_out_portraits_branched` to `orchestrator.py`**

Place it directly after `_fan_out_portraits`:

```python
async def _fan_out_portraits_branched(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    high: list[Checkpoint],
    low: list[Checkpoint],
    ages: list[int],
    intervention: dict,
    original_portraits: list[AgedPortrait],
) -> AsyncIterator[dict]:
    """Branched-mode portrait fan-out.

    - High portraits with year < intervention['year'] are preserved verbatim
      from `original_portraits` and re-emitted with their original index.
    - High portraits with year >= intervention['year'] are regenerated.
    - All low portraits are regenerated (the alternate trajectory is rebuilt
      whole by the existing `_alternate()` step on every branch)."""
    iv_year = int(intervention["year"])
    span = profile.targetYear - profile.presentYear

    def _events_up_to(cps: list[Checkpoint], year: int) -> list[Checkpoint]:
        return [c for c in cps if c.year <= year]

    # Preserved high portraits — yield immediately, no Gemini call.
    by_index_high = {
        p.year: (i, p)
        for i, p in enumerate(original_portraits)
        if p.trajectory == "high"
    }
    preserved_indices: set[int] = set()
    for i, age in enumerate(ages):
        year = profile.presentYear + round(span * (i / 4))
        if year < iv_year:
            for orig_year, (orig_index, orig_portrait) in by_index_high.items():
                if orig_year == year:
                    yield {
                        "phase": "portrait",
                        "trajectory": "high",
                        "index": i,
                        "portrait": orig_portrait.model_dump(),
                    }
                    preserved_indices.add(i)
                    break

    async def _one(index: int, age: int, trajectory: str, source: list[Checkpoint]) -> dict:
        year = profile.presentYear + round(span * (index / 4))
        portrait = await generate_aged_portrait(
            selfie_bytes=selfie_bytes,
            selfie_mime=selfie_mime,
            profile=profile,
            target_age=age,
            target_year=year,
            trajectory=trajectory,  # type: ignore[arg-type]
            relevant_events=_events_up_to(source, year),
        )
        if portrait.imageUrl is None:
            return {
                "phase": "portrait_error",
                "trajectory": trajectory,
                "index": index,
                "message": "image generation failed",
            }
        return {
            "phase": "portrait",
            "trajectory": trajectory,
            "index": index,
            "portrait": portrait.model_dump(),
        }

    tasks = []
    for i, age in enumerate(ages):
        if i not in preserved_indices:
            tasks.append(asyncio.create_task(_one(i, age, "high", high)))
        # Low always regenerates.
        tasks.append(asyncio.create_task(_one(i, age, "low", low)))

    for coro in asyncio.as_completed(tasks):
        yield await coro
```

- [ ] **Step 4: Wire the branched fan-out into `stream_branched_simulation`**

In `stream_branched_simulation`, add `selfie_bytes` and `selfie_mime` to the function signature (defaults match `stream_simulation`), and after the existing `yield {"phase": "complete", ...}`, append:

```python
        if selfie_bytes:
            async for ev in _fan_out_portraits_branched(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, low=alternate_cps, ages=_compute_ages(profile),
                intervention=intervention,
                original_portraits=original_simulation.agedPortraits,
            ):
                yield ev
```

Update the `stream_branched_simulation` signature:

```python
async def stream_branched_simulation(
    profile: Profile,
    intervention: dict,
    original_simulation: SimulationData,
    selfie_bytes: bytes | None = None,
    selfie_mime: str = "image/jpeg",
) -> AsyncIterator[dict]:
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_orchestrator_portraits.py -v`
Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/orchestrator.py backend/tests/test_orchestrator_portraits.py
git commit -m "feat(orchestrator): branched portrait fan-out preserves pre-intervention high"
```

---

## Task 8: Switch `/simulate` and `/simulate/branch` to multipart

**Files:**
- Modify: `backend/app/api/simulate.py`
- Test: `backend/tests/test_simulate_endpoint.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_simulate_endpoint.py`:

```python
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
        yield {"phase": "complete", "simulation": {"profile": profile.model_dump(), "agedPortraits": [], "checkpointsHigh": [], "checkpointsLow": [], "futureSelfOpening": "x", "futureSelfReplies": {}}}

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_simulate_endpoint.py -v`
Expected: 422 Unprocessable Entity (current endpoint expects JSON body).

- [ ] **Step 3: Replace `backend/app/api/simulate.py`**

```python
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.models import Profile, SimulationData
from app.services.orchestrator import stream_branched_simulation, stream_simulation

router = APIRouter()


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
    except Exception as e:  # noqa: BLE001
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
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"profile: {e}")


async def _read_selfie(selfie: UploadFile | None) -> tuple[bytes | None, str]:
    if selfie is None:
        return None, "image/jpeg"
    data = await selfie.read()
    return data, selfie.content_type or "image/jpeg"


async def _ndjson(events: AsyncIterator[dict]) -> AsyncIterator[bytes]:
    async for ev in events:
        yield (json.dumps(ev) + "\n").encode("utf-8")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_simulate_endpoint.py tests/test_health.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/simulate.py backend/tests/test_simulate_endpoint.py
git commit -m "feat(api): switch /simulate and /simulate/branch to multipart with selfie"
```

---

## Task 9: Frontend API client — multipart + portrait events

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Replace `simulateStream` and `simulateBranchStream`**

In `frontend/src/lib/api.ts`, replace both functions with:

```typescript
export async function* simulateStream(
  profile: Profile,
  selfie: Blob,
): AsyncIterableIterator<StreamEvent> {
  const form = new FormData();
  form.append("profile", JSON.stringify(profile));
  form.append("selfie", selfie, "selfie.jpg");
  yield* readNDJSON(
    await fetch(`${BASE}/simulate`, {
      method: "POST",
      body: form,
    }),
  );
}

export async function* simulateBranchStream(
  profile: Profile,
  interventionYear: number,
  interventionText: string,
  originalSimulation: SimulationData,
  selfie: Blob,
): AsyncIterableIterator<StreamEvent> {
  const form = new FormData();
  form.append("profile", JSON.stringify(profile));
  form.append("intervention_year", String(interventionYear));
  form.append("intervention_text", interventionText);
  form.append("original_simulation", JSON.stringify(originalSimulation));
  form.append("selfie", selfie, "selfie.jpg");
  yield* readNDJSON(
    await fetch(`${BASE}/simulate/branch`, {
      method: "POST",
      body: form,
    }),
  );
}
```

(Leave `readNDJSON` and the `chat`/`chatVoice` helpers below it untouched.)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: TypeScript will surface every call site of `simulateStream` and `simulateBranchStream` that doesn't pass a selfie. Note them — Task 11 fixes them.

If errors are *only* "Expected 2 arguments, but got 1" / "Expected 5, but got 4" on these functions in `screens/screens-a.tsx` and `screens/screens-b.tsx`, that's expected — proceed to commit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api-client): post selfie via multipart on simulate + branch"
```

---

## Task 10: Build the Selfie screen component

**Files:**
- Create: `frontend/src/screens/screen-selfie.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/screens/screen-selfie.tsx`:

```typescript
import { useEffect, useRef, useState } from "react";
import type { ScreenProps } from "../App";

type CaptureState =
  | { kind: "idle" }
  | { kind: "live"; stream: MediaStream }
  | { kind: "preview"; blob: Blob; url: string };

export function ScreenSelfie({ onContinue, onBack, selfie, setSelfie }: ScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // If a selfie already exists in App state (user came back), preview it.
  const [state, setState] = useState<CaptureState>(() =>
    selfie ? { kind: "preview", blob: selfie, url: URL.createObjectURL(selfie) } : { kind: "idle" },
  );
  const [cameraDenied, setCameraDenied] = useState(false);

  // Wire the live stream to the video element whenever we enter the "live" state.
  useEffect(() => {
    if (state.kind !== "live" || !videoRef.current) return;
    videoRef.current.srcObject = state.stream;
    videoRef.current.play().catch(() => {});
    return () => {
      state.stream.getTracks().forEach((t) => t.stop());
    };
  }, [state]);

  // Revoke object URLs we created to avoid leaks.
  useEffect(() => {
    return () => {
      if (state.kind === "preview") URL.revokeObjectURL(state.url);
    };
  }, [state]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setState({ kind: "live", stream });
    } catch {
      setCameraDenied(true);
    }
  }

  function snap() {
    if (state.kind !== "live" || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    // Cap longest edge at 1024 to keep upload size sane.
    const longest = Math.max(video.videoWidth, video.videoHeight);
    const scale = longest > 1024 ? 1024 / longest : 1;
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        state.stream.getTracks().forEach((t) => t.stop());
        setState({ kind: "preview", blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.9,
    );
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState({ kind: "preview", blob: file, url: URL.createObjectURL(file) });
  }

  function retake() {
    if (state.kind === "preview") URL.revokeObjectURL(state.url);
    setState({ kind: "idle" });
  }

  function confirm() {
    if (state.kind !== "preview") return;
    setSelfie(state.blob);
    onContinue();
  }

  return (
    <div className="screen-pad" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 24 }}>
      <h2 className="serif" style={{ fontSize: 32, textAlign: "center", maxWidth: 600 }}>
        First, look at yourself.
      </h2>

      <div style={{ width: 360, height: 360, background: "var(--ink-3, #222)", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {state.kind === "live" && <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {state.kind === "preview" && <img src={state.url} alt="selfie preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {state.kind === "idle" && <span className="muted" style={{ fontSize: 13 }}>no photo yet</span>}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {state.kind === "idle" && !cameraDenied && (
          <button className="btn" onClick={startCamera}>Use camera</button>
        )}
        {state.kind === "live" && <button className="btn btn-accent" onClick={snap}>Snap</button>}
        {state.kind === "preview" && (
          <>
            <button className="btn" onClick={retake}>Retake</button>
            <button className="btn btn-accent" onClick={confirm}>Use this photo</button>
          </>
        )}
        {state.kind === "idle" && (
          <>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>Upload a file</button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onFileChosen} />
          </>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, maxWidth: 420, textAlign: "center", fontFamily: "var(--mono)" }}>
        Your photo is sent to Gemini to generate the portraits. Nothing is saved on our servers.
      </p>

      <button className="btn-link" onClick={onBack} style={{ position: "absolute", top: 24, left: 24 }}>← back</button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (component itself)**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -40`
Expected: errors will mention `selfie`/`setSelfie` not on `ScreenProps`. Task 11 adds them.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/screen-selfie.tsx
git commit -m "feat(frontend): add Selfie screen with webcam + file-upload fallback"
```

---

## Task 11: Wire Selfie into App.tsx + thread selfie through call sites

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/screens/screens-a.tsx` (Processing screen calls `simulateStream`)
- Modify: `frontend/src/screens/screens-b.tsx` (Timeline screen calls `simulateBranchStream`)

- [ ] **Step 1: Add `selfie` state + props in `App.tsx`**

In `frontend/src/App.tsx`:

1a. Extend the `ScreenProps` interface (existing, near top) — add two fields:

```typescript
  selfie: Blob | null;
  setSelfie: (s: Blob | null) => void;
```

1b. Add the import at the top with the other screen imports:

```typescript
import { ScreenSelfie } from "./screens/screen-selfie";
```

1c. Insert into the `SCREENS` array between landing and intake:

```typescript
  { key: "landing", component: ScreenLanding, label: "01 cold open" },
  { key: "selfie", component: ScreenSelfie, label: "02 selfie" },
  { key: "intake", component: ScreenIntake, label: "03 intake" },
  { key: "processing", component: ScreenProcessing, label: "04 processing" },
  { key: "reveal", component: ScreenReveal, label: "05 reveal" },
  { key: "chat", component: ScreenChat, label: "06 chat" },
  { key: "timeline", component: ScreenTimeline, label: "07 timeline" },
  { key: "slider", component: ScreenSlider, label: "08 slider" },
  { key: "encore", component: ScreenEncore, label: "09 encore" },
```

1d. Add the state hook alongside the others:

```typescript
  const [selfie, setSelfie] = useState<Blob | null>(null);
```

1e. Reset it on `restart`:

```typescript
  const restart = () => {
    setSimulationState(null);
    setTimelineViewed(false);
    setSelfie(null);
    setIdx(0);
  };
```

1f. Pass it to `<Active />`:

```typescript
        <Active
          onContinue={next}
          onBack={back}
          onJumpTo={jumpTo}
          onRestart={restart}
          profile={profile}
          setProfile={setProfile}
          simulation={simulation}
          setSimulation={setSimulation}
          timelineViewed={timelineViewed}
          setTimelineViewed={setTimelineViewed}
          selfie={selfie}
          setSelfie={setSelfie}
        />
```

- [ ] **Step 2: Update `simulateStream` call site in Processing screen**

In `frontend/src/screens/screens-a.tsx`, find the call to `simulateStream(profile)` inside `ScreenProcessing`. Change the function destructure to include `selfie`:

```typescript
export function ScreenProcessing({ onContinue, profile, simulation, setSimulation, selfie }: ScreenProps) {
```

And the call:

```typescript
  if (!selfie) {
    // Defensive: the Selfie screen gates this flow, but if state is missing
    // (hot reload, dev jump nav), bail gracefully.
    return <div className="screen-pad">No selfie captured. Go back to the selfie step.</div>;
  }
  // ...
  for await (const ev of simulateStream(profile, selfie)) { ... }
```

(The exact placement depends on the existing function shape — locate the `for await` over `simulateStream` and add the `selfie` argument; locate the destructure and add `selfie` to it. If a guard is awkward, render a "no selfie" message and a back button instead of throwing.)

- [ ] **Step 3: Update `simulateBranchStream` call site in Timeline/Slider**

In `frontend/src/screens/screens-b.tsx`, locate the call to `simulateBranchStream(...)` and add `selfie!` as the final argument (the App-level state guarantees it exists by this screen — assert non-null with `selfie!`). Add `selfie` to the destructure of `ScreenProps` for whichever screen makes the call.

- [ ] **Step 4: Make the dev nav skip the selfie when jumped to without state**

(Optional polish.) The bottom dev nav lets you jump directly to any screen. When jumping to Processing without a selfie, the guard from Step 2 keeps things from crashing. Verify by running the dev server and clicking through.

- [ ] **Step 5: Run dev server + click through golden path**

```
cd frontend && npm run dev
```

In the browser at http://localhost:5173:
1. Click "Upload a selfie" on Landing → arrives on Selfie.
2. Click "Use camera" (or "Upload a file" + pick any image) → preview shows.
3. Click "Use this photo" → arrives on Intake.
4. Fill out intake → Processing should start the simulation. (If `GEMINI_API_KEY` is unset in `backend/.env`, portraits silently skip; the rest still works.)
5. Reveal/Chat/Timeline/Slider should all render with text content.

- [ ] **Step 6: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/screens/screen-selfie.tsx frontend/src/screens/screens-a.tsx frontend/src/screens/screens-b.tsx
git commit -m "feat(frontend): wire Selfie screen into nav + thread selfie through simulate calls"
```

---

## Task 12: Processing screen — show portrait progress

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

- [ ] **Step 1: Track portrait events in the Processing screen**

In `frontend/src/screens/screens-a.tsx`, inside the `for await` loop in `ScreenProcessing`, add a counter:

```typescript
  const [portraitsDone, setPortraitsDone] = useState(0);
  // ...
  for await (const ev of simulateStream(profile, selfie)) {
    // existing phase handling ...
    if (ev.phase === "portrait") {
      setPortraitsDone((n) => n + 1);
      // Merge into simulation.agedPortraits as it arrives.
      setSimulation((sim) => sim ? { ...sim, agedPortraits: [...sim.agedPortraits, ev.portrait] } : sim);
    }
    if (ev.phase === "portrait_error") {
      setPortraitsDone((n) => n + 1);
    }
  }
```

(`setSimulation` may currently take `SimulationData | null`, not a function — if so, capture the latest sim in a ref and call `setSimulation({ ...latest, agedPortraits: [...] })`.)

- [ ] **Step 2: Render the portrait counter in the Processing UI**

Below the existing phase indicators, add:

```typescript
  {portraitsDone > 0 && (
    <div className="muted" style={{ fontSize: 12, fontFamily: "var(--mono)" }}>
      rendering portraits · {portraitsDone} / 10
    </div>
  )}
```

- [ ] **Step 3: Manual verification**

Run dev server and the backend (with `GEMINI_API_KEY` set in `backend/.env`). Walk the flow. Expected: Processing screen shows "rendering portraits · 1 / 10" climbing during the wait. With the key unset, the counter stays at 0 and the rest still works.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(processing): show portrait progress + merge into simulation as they arrive"
```

---

## Task 13: Timeline + Slider — render aged portraits

**Files:**
- Modify: `frontend/src/screens/screens-b.tsx`

- [ ] **Step 1: Add a helper for nearest-portrait lookup**

At the top of `screens-b.tsx` (near other small helpers), add:

```typescript
import type { AgedPortrait, Trajectory } from "../types";

function nearestPortrait(
  portraits: AgedPortrait[],
  trajectory: Trajectory,
  year: number,
  maxDistance = 3,
): AgedPortrait | null {
  let best: AgedPortrait | null = null;
  let bestDist = Infinity;
  for (const p of portraits) {
    if (p.trajectory !== trajectory || !p.imageUrl) continue;
    const d = Math.abs(p.year - year);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return bestDist <= maxDistance ? best : null;
}
```

- [ ] **Step 2: Render portrait inset on each Timeline checkpoint card**

Inside `ScreenTimeline`, locate where each checkpoint card is rendered. Wrap the existing card content with a portrait inset:

```typescript
{checkpoints.map((cp, i) => {
  const portrait = simulation
    ? nearestPortrait(simulation.agedPortraits, "high", cp.year)
    : null;
  return (
    <div key={i} className="checkpoint-card">
      {portrait && (
        <img
          src={portrait.imageUrl ?? undefined}
          alt={`you at ${portrait.age}`}
          style={{ width: 80, height: 80, borderRadius: 6, objectFit: "cover", float: "left", marginRight: 12 }}
        />
      )}
      {/* existing card content */}
    </div>
  );
})}
```

(Keep the existing card styles; the inset is additive. Adjust `trajectory` to match whichever the active screen state uses — Timeline currently shows `checkpointsHigh`.)

- [ ] **Step 3: Render side-by-side portraits in the Slider**

Inside `ScreenSlider`, find where it renders the high vs low comparison. Above (or alongside) the text content, add two portrait slots:

```typescript
const sliderYear = profile.presentYear + Math.round((profile.targetYear - profile.presentYear) * sliderT);
const highPortrait = simulation ? nearestPortrait(simulation.agedPortraits, "high", sliderYear) : null;
const lowPortrait = simulation ? nearestPortrait(simulation.agedPortraits, "low", sliderYear) : null;

return (
  <>
    <div style={{ display: "flex", gap: 24, justifyContent: "center", margin: "24px 0" }}>
      <figure style={{ textAlign: "center" }}>
        {highPortrait && <img src={highPortrait.imageUrl ?? undefined} alt="high path" style={{ width: 280, height: 280, borderRadius: 8, objectFit: "cover" }} />}
        <figcaption className="muted" style={{ fontSize: 12 }}>current path</figcaption>
      </figure>
      <figure style={{ textAlign: "center" }}>
        {lowPortrait && <img src={lowPortrait.imageUrl ?? undefined} alt="low path" style={{ width: 280, height: 280, borderRadius: 8, objectFit: "cover" }} />}
        <figcaption className="muted" style={{ fontSize: 12 }}>alternate path</figcaption>
      </figure>
    </div>
    {/* existing slider + text content */}
  </>
);
```

(`sliderT` is the existing slider position 0..1; if the slider variable has a different name in this codebase, use that. If the existing layout already has its own structure, integrate the portraits where they read best — the design intent is "two faces, same person, side by side, swap as the slider moves".)

- [ ] **Step 4: Manual verification**

Backend running with `GEMINI_API_KEY` set, frontend running. Walk the flow end-to-end. Expected:
- Timeline cards show small portrait insets when a portrait year is within 3 years of the card year.
- Slider shows two faces; dragging swaps them between the 5 anchor years.
- Without the key set, both surfaces simply render without portraits — no errors.

- [ ] **Step 5: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/screens-b.tsx
git commit -m "feat(timeline+slider): render aged portraits per checkpoint and side-by-side"
```

---

## Task 14: Reveal/Chat hero — use final-year high portrait

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx` (Reveal)
- Modify: `frontend/src/screens/screens-b.tsx` (Chat)

- [ ] **Step 1: Add hero portrait to Reveal**

In `ScreenReveal` in `screens-a.tsx`, find the hero region (where the future-self opening line is shown). Add above (or behind, depending on layout) the headline:

```typescript
const heroPortrait = simulation?.agedPortraits.find(
  (p) => p.trajectory === "high" && p.year === profile.targetYear,
);

// ... in JSX:
{heroPortrait?.imageUrl && (
  <img
    src={heroPortrait.imageUrl}
    alt="you, in twenty years"
    style={{ width: 320, height: 320, borderRadius: "50%", objectFit: "cover", margin: "0 auto 24px", display: "block" }}
  />
)}
```

- [ ] **Step 2: Add the same hero to Chat**

In `ScreenChat` in `screens-b.tsx`, locate the chat header (above the message list). Add the same `heroPortrait` lookup and a smaller (96×96) avatar in the header.

- [ ] **Step 3: Manual verification**

Run end-to-end with `GEMINI_API_KEY` set. Reveal should show a large round future-self portrait above the opening line. Chat header should show a smaller version of the same face.

- [ ] **Step 4: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/screens-a.tsx frontend/src/screens/screens-b.tsx
git commit -m "feat(reveal+chat): use final-year high portrait as the hero image"
```

---

## Final verification

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && .venv/bin/pytest -v`
Expected: all tests pass (health + portrait_model + image_generator + orchestrator_portraits + simulate_endpoint).

- [ ] **Step 2: Full TS check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: End-to-end smoke test (with key)**

With `GEMINI_API_KEY` set in `backend/.env`:
1. Start backend: `./scripts/dev.sh`
2. Start frontend: `cd frontend && npm run dev`
3. Walk the full flow: Landing → Selfie (snap a photo) → Intake (fill 7 fields) → Processing (watch portrait counter) → Reveal (see hero face) → Chat → Timeline (see insets) → Slider (drag, see two faces).
4. Trigger an intervention from Timeline. Confirm: pre-intervention high portraits stay, post-intervention high regenerate, low regenerates wholly.

- [ ] **Step 4: End-to-end smoke test (without key)**

Unset `GEMINI_API_KEY` in `backend/.env` and restart backend. Walk the same flow. Expected: no portraits anywhere, but every screen renders and works.

---

## Self-review notes (for the reviewer)

This plan covers every section of the spec:
- Selfie capture UI (Tasks 10, 11) — webcam + file upload + privacy line ✓
- Data contract drop `ages`/add `agedPortraits` (Tasks 2, 3) ✓
- Backend image_generator + prompt + Gemini call (Tasks 4, 5) ✓
- Orchestrator fan-out + branched preserve (Tasks 6, 7) ✓
- Multipart endpoint signature (Task 8) ✓
- Frontend client (Task 9) ✓
- Processing/Reveal/Chat/Timeline/Slider rendering (Tasks 12, 13, 14) ✓
- Failure modes (no API key, single-portrait failure, camera denial) — handled in Tasks 5, 8, 10, with the smoke test in final verification covering both no-key and with-key paths ✓
- Privacy line — Task 10 ✓
- Settings + .env keys — Task 1 ✓

Areas the executor should look at carefully:
- Task 11 Step 2/3 reference call sites whose exact shape depends on existing code — locate the existing `simulateStream(...)` and `simulateBranchStream(...)` invocations and add the selfie argument; the destructure pattern is established by the rest of the codebase.
- Task 13 Step 3 references a slider position variable (`sliderT`) whose name is assumed — use the actual existing variable from `ScreenSlider`.
- Task 12 Step 1 mentions a `setSimulation` ref pattern in case the setter is value-only — check the existing `App.tsx` setter signature and adapt.
