# Health Intake & Clinical Card

**Status:** Draft
**Date:** 2026-04-25
**Branch:** `feature/health-intake`

## Goal

Add a fast, additive health-background intake step to AlterEgo — covering both **physical** and **mental** health — and surface the simulated outcome as a "clinical card" alongside the future-self portrait at the reveal. Position the product for the LA Hacks 2026 *Catalyst for Care* track by making the full health trajectory (body and mind) legible without changing the existing tone, pipeline, or feature set.

This change is strictly additive. No existing screens, prompts, fields, or behaviors are removed.

## Non-Goals

- No medical-history intake, no "last physical" question, no clinically actionable claims.
- No new endpoints. Clinical data is generated inside the existing `/simulate` stream.
- No changes to the streaming pipeline phases beyond extending the final `finalizing` payload.
- No changes to TONE_BLOCK, voice, timeline, slider, chat, or end screens.
- No medical disclaimers in this spec; copy decisions for safety language are deferred to implementation review.

## User-Visible Changes

### 1. New screen: `health` (between `intake` and `processing`)

A single-page form (no per-field stepping like `intake`) with seven button-group questions visible at once, grouped under two short subheads: **Body** and **Mind**.

**Body**

| Field | Button options | Profile key |
|---|---|---|
| Sleep per night | `<5` · `5–6` · `6–7` · `7–8` · `8+` (hours) | `sleepHours` |
| Exercise per week | `0` · `1–2` · `3–4` · `5+` (days) | `exerciseDays` |
| Caffeine per day | `0` · `1` · `2` · `3` · `4+` (cups) | `caffeineCups` |
| Alcohol per week | `0` · `1–3` · `4–7` · `8–14` · `15+` (drinks) | `alcoholDrinks` |

**Mind**

| Field | Button options | Profile key |
|---|---|---|
| Typical stress level | `low` · `moderate` · `high` · `severe` | `stressLevel` |
| Mood baseline (last month) | `mostly low` · `mixed` · `mostly steady` · `mostly positive` | `moodBaseline` |
| Loneliness (typical week) | `rarely` · `sometimes` · `often` | `lonelinessFrequency` |

- All seven questions are optional. A "skip" / "continue" button advances the user without selections.
- All controls are button groups, not range sliders — faster to answer, less fiddly.
- Selecting a button toggles selection; tapping a second time clears (so users can correct without a separate clear control).
- Layout: each subhead ("Body", "Mind") sits above its rows. Each row is a labeled button group; rows stack vertically.
- Animation matches the existing intake aesthetic: 600 ms `fade-in` on mount, 200 ms transitions on button states.
- Styling: pure inline React with `var()` tokens (matches existing intake; no Tailwind, no new component library).
- The page should remain visually scannable — short row labels, tight vertical rhythm — so seven questions still feel fast.

### 2. Reveal screen: portrait + clinical card

The existing reveal layout (vertical centered column with portrait → meta → quote) becomes a 2-column layout at viewports ≥ 1024 px wide:

- **Left column (unchanged content):** aged portrait, meta line, future-self streamed quote, "future self speaking" indicator.
- **Right column (new):** "Clinical card" — a small panel listing 2–3 modifiable risk factors (mix of physical and mental, drawn from whichever signals dominate the run) with one-line consequences and a final-state label (`stable` / `strained` / `critical`). The card represents combined body + mind state, not just physical.
- The clinical card fades in alongside the existing phase-3 quote (uses the same `phase >= 3` gate and 1200–1600 ms opacity transition).
- Below 1024 px the card stacks below the quote, full-width-bounded.
- The Mark, corner label, and continue button positions are preserved.

The card visual matches existing styles: serif heading at small size, sans body, `var(--accent)` rule, no icons, no scoring numbers. Each risk factor is rendered as `label` + `consequence`. Domain (physical vs mental) is implicit in the wording — no badges or icons.

## Architecture

### Frontend changes

#### `frontend/src/App.tsx`

- Insert a new entry into `SCREENS` between `intake` and `processing`:
  ```ts
  { key: "health", component: ScreenHealth, label: "04 health" },
  ```
- Renumber subsequent labels (`processing` → `05`, `reveal` → `06`, etc.). Order indices update automatically.
- No state machine logic changes; navigation already keys off `SCREENS.length`.

#### `frontend/src/screens/screens-a.tsx`

- Add `ScreenHealth` component near `ScreenIntake`. Same prop shape (`ScreenProps`).
- Component owns no transient state beyond the local selection map; writes through `setProfile` on each tap (same immutable spread pattern as intake).
- Reuse existing `Meta`, `var(--accent)`, `var(--ease)` tokens.

- Modify `ScreenReveal` layout container to a 2-column flex at `≥ 1024px`:
  - Outer container: `display: flex; flexDirection: row; gap: clamp(24px, 4vw, 64px); alignItems: center; justifyContent: center` at desktop; `column` below 1024 px (matchMedia or CSS `@media`).
  - Existing portrait + meta + quote group goes in the left column unchanged.
  - New `<ClinicalCard simulation={simulation} phase={phase} />` in the right column.
- The `phase` opacity gating remains identical for the existing left-column elements.

#### `frontend/src/types.ts`

- Extend `Profile`:
  ```ts
  // Body
  sleepHours?: "<5" | "5-6" | "6-7" | "7-8" | "8+" | null;
  exerciseDays?: "0" | "1-2" | "3-4" | "5+" | null;
  caffeineCups?: "0" | "1" | "2" | "3" | "4+" | null;
  alcoholDrinks?: "0" | "1-3" | "4-7" | "8-14" | "15+" | null;
  // Mind
  stressLevel?: "low" | "moderate" | "high" | "severe" | null;
  moodBaseline?: "mostly low" | "mixed" | "mostly steady" | "mostly positive" | null;
  lonelinessFrequency?: "rarely" | "sometimes" | "often" | null;
  ```
- Add new types:
  ```ts
  type HealthState = "stable" | "strained" | "critical";

  interface ClinicalRiskFactor {
    label: string;
    consequence: string;
  }

  interface ClinicalSummary {
    riskFactors: ClinicalRiskFactor[]; // 2–3 items
    finalHealthState: HealthState;
  }

  interface SimulationData {
    // ... existing fields
    clinicalSummary?: ClinicalSummary;  // optional for back-compat with cached runs
  }
  ```

### Backend changes

#### `backend/app/models/profile.py`

- Add seven optional fields with `Literal` types matching the frontend buckets (four body fields + three mind fields).
- Validators silently drop unknown values (matches mbti/values precedent).
- All fields default to `None`.

#### `backend/app/services/state_model.py`

Body fields seed `health_strain`. Mind fields seed `meaning_drift`, `social_isolation`, and (for chronic stress) also push `health_strain`. Existing formulas remain; new deltas stack on top, then clamp to `[0, 1]`.

Body deltas to `health_strain` (on top of existing `0.2 + overwork * 0.3 + age_baseline`):

| Field value | Delta to `health_strain` |
|---|---|
| `sleepHours = "<5"` | `+0.15` |
| `sleepHours = "5-6"` | `+0.08` |
| `sleepHours = "6-7"` | `+0.02` |
| `sleepHours = "7-8"` | `-0.05` |
| `sleepHours = "8+"` | `-0.03` |
| `exerciseDays = "0"` | `+0.08` |
| `exerciseDays = "1-2"` | `+0.02` |
| `exerciseDays = "3-4"` | `-0.05` |
| `exerciseDays = "5+"` | `-0.10` |
| `caffeineCups = "3"` | `+0.02` |
| `caffeineCups = "4+"` | `+0.05` |
| `alcoholDrinks = "4-7"` | `+0.02` |
| `alcoholDrinks = "8-14"` | `+0.05` |
| `alcoholDrinks = "15+"` | `+0.12` |

Mind deltas:

| Field value | Aspect | Delta |
|---|---|---|
| `stressLevel = "moderate"` | `meaning_drift` | `+0.03` |
| `stressLevel = "high"` | `meaning_drift` | `+0.08`; `health_strain` `+0.05` |
| `stressLevel = "severe"` | `meaning_drift` | `+0.15`; `health_strain` `+0.10` |
| `moodBaseline = "mostly low"` | `meaning_drift` | `+0.12` |
| `moodBaseline = "mixed"` | `meaning_drift` | `+0.05` |
| `moodBaseline = "mostly positive"` | `meaning_drift` | `-0.05` |
| `lonelinessFrequency = "sometimes"` | `social_isolation` | `+0.05` |
| `lonelinessFrequency = "often"` | `social_isolation` | `+0.15` |

- All affected aspects clamp to `[0, 1]` after deltas apply.
- When all seven fields are `None`, behavior is unchanged from today (back-compat).

#### `backend/app/prompts/orchestration.py`

- Add `_health_block(profile)` helper following the `_mbti_block` / `_values_block` pattern. Returns either an empty string (when no fields are set) or a short two-section bulleted block, omitting any line whose field is `None`:
  ```
  Health background:
    Body:
    - Sleep: 5–6 hrs/night
    - Exercise: 1–2 days/week
    - Caffeine: 3 cups/day
    - Alcohol: 4–7 drinks/week
    Mind:
    - Stress: high
    - Mood: mixed
    - Loneliness: sometimes
  ```
  If all body fields are `None`, omit the "Body:" subhead. Same for "Mind:".
- Inject into all four `render_*_user` functions next to `_mbti_block` / `_values_block` calls.
- Existing TONE_BLOCK and prompt bodies are not modified.

- Add a new `CLINICAL_SUMMARY_SYSTEM` prompt and `render_clinical_user(profile, simulation, final_state)` helper. The system prompt:
  - Reuses `TONE_BLOCK` verbatim.
  - Asks Claude to identify 2–3 *modifiable* risk factors grounded in events from the trajectory plus the user's health intake. Risk factors may be physical (sleep debt, sedentary baseline, alcohol load) or mental (chronic stress, low mood, isolation). Claude picks whichever 2–3 are most load-bearing for the run, mixing freely across body and mind.
  - Returns strict JSON conforming to `ClinicalSummary`.
  - Allowed values for `finalHealthState`: `stable`, `strained`, `critical` — picked by Claude based on the run's final state vector (combined `health_strain`, `meaning_drift`, `social_isolation` signals) and event content.

#### `backend/app/services/orchestrator.py`

- Extend the `finalizing` phase: after producing `futureSelfOpening` and `futureSelfReplies`, generate the `ClinicalSummary` via the new prompt and include it in the `complete` payload.
- The streamed `finalizing` event remains. The `complete` payload's `SimulationData` gains a `clinicalSummary` key.
- No new pipeline phase; no new endpoint. Latency increase is bounded to one extra Claude call at the tail.
- Routing: use the same tier as the existing finalize call.

#### `backend/app/services/chat.py`

- Continues to receive `SimulationData` from the frontend. No changes; `clinicalSummary` rides along but is unused in chat context.

## Data Flow

1. User completes existing `intake` → fills new `health` screen → `Profile` (with optional health fields) is built on the frontend.
2. `POST /simulate` → backend builds `State` from `Profile` (including new health-strain deltas) → counting → planning → events → finalize.
3. During finalize, Claude generates the `ClinicalSummary` from the completed trajectory and profile.
4. `complete` event delivers `SimulationData` including `clinicalSummary`.
5. Reveal screen displays the portrait + quote on the left, clinical card on the right.
6. Subsequent `/chat` calls pass the unchanged `SimulationData` back; chat does not surface the clinical card.

## Error Handling

- **Missing health fields:** Profile validates each field independently; unknowns are dropped to `None`. State model and prompts handle `None` gracefully (no contribution).
- **Clinical summary generation fails (parse error, Claude refusal, etc.):** Backend returns `clinicalSummary = None` rather than failing the simulation. Frontend's reveal renders the existing single-column layout when `clinicalSummary` is missing (graceful fallback).
- **Old cached `SimulationData` without `clinicalSummary`:** Same fallback as above. The field is optional on `SimulationData` for back-compat.

## Testing

- **Backend unit tests:** state-model deltas (verify `health_strain`, `meaning_drift`, `social_isolation` shifts for representative profiles across body and mind inputs), profile validators (drop bogus enum values for all seven fields), clinical-summary prompt JSON shape (mock Claude response).
- **Backend integration:** `/simulate` end-to-end with a profile that includes both body and mind health fields; assert `clinicalSummary` present and well-formed, with mixed physical/mental risk factors.
- **Frontend manual:** intake → health → processing → reveal flow, with all fields filled, only body filled, only mind filled, and all skipped; verify reveal stacks correctly at desktop and below 1024 px.

## Open Questions

None blocking. Two minor decisions are deferred to implementation:

1. Exact button visual style for the health page (border weight, hover color) — pick during build, match intake's existing button feel.
2. Whether to show a tiny "based on your inputs" footnote under the clinical card — decide after seeing the rendered card on real data.

## File-by-File Summary

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Insert `health` entry, renumber labels |
| `frontend/src/screens/screens-a.tsx` | Add `ScreenHealth` (Body + Mind sections), modify `ScreenReveal` to 2-column at desktop, render `ClinicalCard` |
| `frontend/src/types.ts` | Profile body + mind health fields, `ClinicalSummary` types, optional field on `SimulationData` |
| `backend/app/models/profile.py` | Seven optional `Literal` fields with validators (4 body, 3 mind) |
| `backend/app/services/state_model.py` | Extend `health_strain`, `meaning_drift`, `social_isolation` seeding |
| `backend/app/prompts/orchestration.py` | `_health_block`, inject into all four renderers, new `CLINICAL_SUMMARY_SYSTEM` + `render_clinical_user` |
| `backend/app/services/orchestrator.py` | Generate `clinicalSummary` at end of `finalizing`, include in `complete` |
