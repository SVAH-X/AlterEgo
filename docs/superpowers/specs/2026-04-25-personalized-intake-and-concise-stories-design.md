# Personalized Intake & Concise Stories — Design

Date: 2026-04-25
Branch: `feature/personalized-intake`
Worktree: `.worktrees/personalized-intake`

## Problem

Two complaints from current `/simulate` output:

1. **Stories feel generic.** The simulator only knows the user through `occupation`, `workHours`, `topGoal`, `topFear`. Two users with the same job and the same goal get nearly identical agent populations, event sequences, and reactions. There is no input that tells the model *what kind of person* the user is, so when it predicts behavior at decision points it falls back to occupation-driven archetypes.
2. **Stories are too verbose.** Each Checkpoint card can be up to ~5 sentences (`title` 4–10 words, `event` 1–2 sentences, `did` 1 sentence, `consequence` 1–2 sentences). Across 6 high-trajectory cards on the reveal screen this reads as a wall of text. The future-self voice (`futureSelfOpening` 35–70 words, three replies at 50–100 words each) compounds the issue on the chat screen.

A third issue surfaced during design: the alternate-trajectory phase (`checkpointsLow`) is dead from the user's perspective — no frontend screen reads it — but the backend still runs `_alternate()` on every simulation, gating response time on an extra Sonnet call.

## Goals

- More signal into the simulator's decision-making, with minimal added intake friction.
- Tighter checkpoint and future-self output, without losing the contemplative voice.
- Remove the dead alternate phase to reclaim latency and simplify types.

## Non-goals

- Portrait prompt changes. Per user direction, age progression visuals are fine.
- New endpoints, new services, new state, new screens (only intake content changes).
- Changing `topGoal` / `topFear` wording.
- Re-introducing a UI for `checkpointsLow`.
- Changes to the state model, event pool, or agent dialogue services.

## Approach

Three coordinated changes wired through the existing `/simulate` pipeline, plus one cleanup:

1. **Input** — two new intake steps: an optional MBTI picker and a required 5-pair values dyad block.
2. **Routing** — both fields injected into the counting / planning / detail orchestration prompts, plus a tone-block clause that tells the model to actually use them.
3. **Output** — tighter per-card and future-self length budgets, with a tone-block clause re-aiming "concise" toward distillation rather than clipping.
4. **Cleanup** — strip the alternate phase end-to-end.

## Section 1 — Intake additions

Two new screens appended to `INTAKE_FIELDS` in `frontend/src/screens/screens-a.tsx`. They sit after `topFear` and before `targetYear` because `targetYear` ("how many years should I look ahead?") is the natural last step before the simulation runs.

### Step 7 — MBTI (optional)

A 4×4 grid of the 16 type pills plus a "Skip" button. Click a pill to select; click another to swap; "Skip" or "Continue" advances. The pill list is the existing `VALID_MBTI` set defined in `backend/app/models/profile.py:6`.

- Persists as `profile.mbti = "INTJ"` (or remains `null` on skip).
- No free-text fallback, no construction picker. Anyone who knows their type knows the 4-letter code; anyone who doesn't, skips.
- Existing model field already validates against `VALID_MBTI` — no validator changes needed.
- Existing intake step UI does not render multi-button screens; the dyad screen will share its layout primitive with this one (see Section 1, Step 8).

### Step 8 — Values dyads (required)

Five forced-choice pairs, rendered as a single intake step. Each row is two pill buttons; click one to select, click the other to swap. All five must be answered before "Continue" enables.

| Slug (key) | Left | Right |
|---|---|---|
| `respected_liked` | Respected | Liked |
| `certainty_possibility` | Certainty | Possibility |
| `honest_kind` | Honest | Kind |
| `movement_roots` | Movement | Roots |
| `life_scope` | A smaller life done well | A bigger life done okay |

Phrasing: *"Pick one in each pair. There's no right answer — just yours."* — italic serif, matches the existing intake voice.

No "skip" / "neither" option on individual pairs. The friction of choosing is the signal.

### Final intake order (9 steps)

1. name
2. age
3. occupation
4. workHours
5. topGoal
6. topFear
7. **MBTI (optional)** — new
8. **Values dyads (required)** — new
9. targetYear

The intake step counter (`screens-a.tsx:304`) auto-updates from `INTAKE_FIELDS.length`, so no hard-coded count to change.

### Intake step type

The existing `IntakeField` union supports `text | textarea | number`. Add a third shape:

```ts
type IntakeField =
  | { key: keyof Profile; label: string; placeholder: string; type: "text" | "textarea"; suffix?: string }
  | { key: keyof Profile; label: string; placeholder: string; type: "number"; suffix?: string }
  | { key: "mbti"; label: string; type: "mbti"; suffix?: string }
  | { key: "values"; label: string; type: "dyads"; dyads: DyadSpec[]; suffix?: string }
```

Where `DyadSpec = { slug: string; left: { label: string; slug: string }; right: { label: string; slug: string } }`.

`ScreenIntake` branches on `cur.type` and renders the appropriate shape (text/number input, textarea, mbti grid, or dyad rows). The mbti and dyads branches do not go through `applyValue`; they update `profile.mbti` and `profile.values` directly via their own click handlers, and they manage their own "Continue" enable logic (mbti is always enabled — skip is allowed; dyads enables once all five rows are answered). Voice mode (mic button + TTS playback of the label) remains for text/textarea/number; on the mbti and dyads steps the mic button is hidden and TTS still reads the label.

## Section 2 — Profile model + prompt wiring

### Backend model (`backend/app/models/profile.py`)

```python
class Profile(BaseModel):
    model_config = {"populate_by_name": True}

    name: str
    age: int = Field(ge=0, le=120)
    occupation: str
    workHours: int = Field(ge=0, le=168)
    topGoal: str
    topFear: str
    targetYear: int
    presentYear: int
    mbti: Optional[str] = None                          # unchanged
    values: Optional[Dict[str, str]] = None             # NEW
```

`values` validator (lenient): if present, drop unknown keys, drop entries whose chosen value is not one of the dyad's two valid sides; if the dict ends up empty after filtering, set to `None`. Keeps the contract forgiving across version skew.

### Frontend types (`frontend/src/types.ts`)

```ts
export interface Profile {
  name: string;
  age: number;
  occupation: string;
  workHours: number;
  topGoal: string;
  topFear: string;
  targetYear: number;
  presentYear: number;
  mbti?: string | null;            // already present implicitly via JSON; make explicit
  values?: Record<string, string> | null;   // NEW
}
```

### Prompt blocks

Two helper functions added to `backend/app/prompts/orchestration.py`:

```python
def _mbti_block(profile: Profile) -> str:
    return f"\n- MBTI: {profile.mbti}" if profile.mbti else ""

def _values_block(profile: Profile) -> str:
    if not profile.values:
        return ""
    # Render as: "leans LIKED over respected, POSSIBILITY over certainty, ..."
    # Keys that are missing or whose value is not a recognized side are skipped.
```

Inject both into:

| Prompt fn | File:line | Already has MBTI? | Add MBTI? | Add values? |
|---|---|---|---|---|
| `render_counting_user` | `orchestration.py:82` | no | yes | yes |
| `render_planning_user` | `orchestration.py:285` | yes | (already) | yes |
| `render_branched_planning_user` | `orchestration.py:199` | yes | (already) | yes |
| `render_detail_user` | `orchestration.py:417` | no | yes | yes |
| `render_finalize_user` | `orchestration.py:512` | no | no | no |

Finalize is intentionally left as is — it works from the lived trajectory, which already encodes the personalization.

### Tone-block clause

Add one line to `TONE_BLOCK` (`orchestration.py:21`):

> "When the user faces a choice inside a checkpoint, weight their reaction by their stated values and MBTI when present, not by archetype."

This is the lever that converts the values fields from "decoration in the prompt" into "actual behavioral predictor." Without it, models often default to genre-typical reactions even when the personality fields are present.

## Section 3 — Verbosity tightening

All edits in `backend/app/prompts/orchestration.py`. No frontend or model changes. Cards already render `event` / `did` / `consequence` as distinct rows on the reveal and timeline screens, so shrinking each row shrinks the visible blocks directly.

### Per-checkpoint card (`DETAIL_SYSTEM`, lines 380–386)

| Field | Current | Proposed |
|---|---|---|
| title | 4–10 words, no trailing period | 4–8 words, no trailing period |
| event | 1–2 sentences | **1 sentence** |
| did | 1 sentence | 1 sentence, ≤15 words |
| consequence | 1–2 sentences | **1 sentence** |
| tone | "warn" / "neutral" / "good" | unchanged |

Net: each card drops from up to ~5 sentences to ~3. With 6 cards on the high trajectory, that's roughly 12 fewer sentences on the reveal surface.

The example titles in the system prompt are also tightened to fit 4–8 words (current examples already fit but add a cap-respecting one).

### Future-self voice (`FINALIZE_SYSTEM`, lines 474–495)

| Field | Current | Proposed |
|---|---|---|
| `futureSelfOpening` | 35–70 words | **25–45 words** |
| `futureSelfReplies` (each ×3) | 50–100 words | **35–60 words** |

Net: future-self total drops from ~250–370 words to ~130–225. Voiced playback also gets shorter, which helps on the chat screen.

The "Bad / Good" exemplar in the prompt is shortened in line with the new word budget.

### Tone-block clause

Add one line to `TONE_BLOCK`:

> "Compression is part of dignity. Say the thing once, in the fewest true words."

This re-aims the model: the goal is "concise" without losing the contemplative voice. Without this clause, just shrinking word counts tends to produce clipped, tweet-like output instead of distilled writing.

## Section 4 — Strip the alternate phase

`checkpointsLow` is in the data types and the seed mock data, but `grep "checkpointsLow"` across `frontend/src` returns only `types.ts:36` and `data.ts:88` — no rendering screen. Meanwhile the backend runs `_alternate()` on every simulation, gathered with finalize, costing one full Sonnet call gating the response.

### Backend

- Remove `ALTERNATE_SYSTEM` and `render_alternate_user` from `backend/app/prompts/orchestration.py` (lines 533–574).
- Remove `_alternate()` from `backend/app/services/orchestrator.py` (line 467) and both call sites (lines 96 and 293).
- Replace `final_payload, alternate_cps = await asyncio.gather(...)` with `final_payload = await finalize_task` at lines 97 and 294.
- Remove `checkpointsLow` from `SimulationData` in `backend/app/models/simulation.py:18`.
- Remove all `checkpointsLow=alternate_cps` payload construction (lines 120, 129, 317, 326).
- Remove the alternate-portrait regeneration logic referenced by the comment at orchestrator.py:581 (search the file at implementation time; remove if it exists).
- Inspect `backend/app/prompts/future_self.py:54` (mentions "an alternate version of you who made different choices"); rewrite that section to not reference an alternate trajectory.
- Remove `ALTERNATE_SYSTEM` and `render_alternate_user` from the import block at `orchestrator.py:22, 27`.

### Frontend

- Remove `checkpointsLow: Checkpoint[]` from `frontend/src/types.ts:36`.
- Remove `checkpointsLow` block from `frontend/src/data.ts:88` seed.
- Update `frontend/src/App.tsx:257` status copy: `"weaving the threads — the alternate path, the voice"` → `"weaving the threads — the voice"`.
- `grep "checkpointsLow"` across `frontend/src` after edits: should return zero results.

### Outcome

- One fewer Sonnet call per simulation (~3–6 sec faster reveal in typical runs).
- `SimulationData` shape becomes one field smaller.
- `orchestrator.py` loses `_alternate()` and one task-gather site per branch.
- No user-visible UI changes (the screen never showed it).

## Data flow diagram

```
                        ┌─────────────────────────┐
                        │   Intake (9 steps)      │
                        │                         │
                        │   1. name               │
                        │   2. age                │
                        │   3. occupation         │
                        │   4. workHours          │
                        │   5. topGoal            │
                        │   6. topFear            │
                        │   7. MBTI (optional)  ← NEW
                        │   8. Values dyads     ← NEW
                        │   9. targetYear         │
                        └────────────┬────────────┘
                                     │
                                     ▼
                            POST /simulate
                                     │
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
       counting                  planning                   detail
   (counts agents)         (plans events)            (writes cards)
            │                        │                        │
            └─ MBTI (NEW) ─┬─ MBTI (existing) ─┬─ MBTI (NEW) ─┘
                          │                    │
                values (NEW)         values (NEW)        values (NEW)
                          │                    │
                          └────────┬───────────┘
                                   ▼
                              finalize
                       (futureSelf opening + replies,
                        no MBTI/values needed —
                        trajectory carries the signal)
                                   │
                                   ▼
                          SimulationData
                          (no checkpointsLow ← REMOVED)
```

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Removing `_alternate()` breaks something downstream that quietly references `checkpointsLow`. | Pre-flight grep across both repos before deletion; the search done in this design returned only the dead refs. Re-grep at implementation time. |
| Length tightening produces clipped, "tweet-like" cards. | The new tone-block clause ("Compression is part of dignity. Say the thing once, in the fewest true words.") explicitly steers away from clipping. Validate by running 3–5 sample simulations after the change. |
| Values dyads feel reductive to the user (forced binaries). | Phrasing acknowledges it: *"Pick one in each pair. There's no right answer — just yours."* Five dyads is enough dimensions to feel interesting; ten would feel like a quiz. |
| MBTI signal is noisy or stereotype-driven inside the LLM. | It's optional, never required. The prompt blocks frame MBTI as one of several signals, not the dominant one. The values block is treated as primary. |
| Frontend dyad UI introduces a new layout primitive that doesn't match the existing intake style. | Reuse existing intake fonts, colors, and animation timing (see `screens-a.tsx:321–392`). Pills should look like the existing `.field` styling reskinned as buttons. |

## Open questions

None at write time. If something surfaces during planning, route it back through brainstorming.

## Acceptance criteria

- Intake form has 9 steps; MBTI is skippable, dyads are not.
- A `Profile` payload with both `mbti` and `values` populated successfully drives a `/simulate` end-to-end.
- A `Profile` payload with neither populated still drives `/simulate` end-to-end (backwards-compatible).
- Per-card output averages ≤3 sentences across 6 cards on a sample run; future-self opening ≤45 words; each reply ≤60 words.
- `grep "checkpointsLow"` across `backend/` and `frontend/src` returns zero results.
- `grep "alternate"` across `backend/app` returns zero results outside of code comments unrelated to the dropped feature.
- `npm run typecheck` passes.
- `/simulate` reveal end-to-end on a fresh profile is faster than baseline by approximately one Sonnet call (~3–6 seconds).

## Out of scope (deferred)

Items considered and explicitly deferred from this spec:

- Geography / mobility intake field (Approach B from brainstorming).
- "Hobby / identity outside work" field (Approach B).
- "Inner circle / who's at home" textarea (Approach A from brainstorming).
- "Money pressure" multi-choice (Approach A).
- Behavioral past-tense questions (e.g., "What do people get wrong about you?") — Family 2 from personality brainstorm.
- Vignette / scenario question (Family 3).
- Voice cloning sample collection from the new intake steps (the dyad and MBTI screens have no textarea content to record).
- Re-introducing a `checkpointsLow` UI as a "what-if" toggle.

These are recorded so a future iteration knows which directions were considered and parked.
