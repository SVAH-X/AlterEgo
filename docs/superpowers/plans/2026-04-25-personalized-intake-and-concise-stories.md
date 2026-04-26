# Personalized Intake & Concise Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MBTI + values dyads to the intake form, route them into the orchestration prompts, tighten checkpoint and future-self length budgets, and strip the dead alternate-trajectory phase end-to-end.

**Architecture:** Two new intake steps (optional MBTI picker, required 5-pair values dyads) feed `Profile.mbti` and `Profile.values` (`Optional[Dict[str, str]]`). Two render-helpers (`_mbti_block`, `_values_block`) inject those into the counting/planning/detail prompts, with one new tone-block clause to actually weight reactions by them. Per-card and future-self length specs in `orchestration.py` are tightened. The unused `_alternate()` Sonnet call and `checkpointsLow` field are removed throughout backend and frontend.

**Tech Stack:** Python 3.11+ (FastAPI, Pydantic v2, pytest), TypeScript + React + Vite, Anthropic Python SDK.

**Spec:** [`docs/superpowers/specs/2026-04-25-personalized-intake-and-concise-stories-design.md`](../specs/2026-04-25-personalized-intake-and-concise-stories-design.md)

**Working directory for all tasks:** `/Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake` on branch `feature/personalized-intake`.

---

## Pre-flight

### Task 0: Verify clean baseline

**Files:** none (verification only)

- [ ] **Step 1: Confirm worktree state**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake
git status
git log -1 --oneline
```
Expected: branch `feature/personalized-intake`, last commit is the spec doc (`docs(spec): personalized intake...`).

- [ ] **Step 2: Install backend deps**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake
./scripts/setup.sh
```
Expected: `backend/.venv` is created and dependencies installed (FastAPI, Pydantic, pytest, Anthropic, etc.). If the script is missing in the worktree, fall back to:
```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

- [ ] **Step 3: Install frontend deps**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake/frontend
npm install
```
Expected: completes without errors.

- [ ] **Step 4: Run baseline backend tests**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake/backend
source .venv/bin/activate
pytest -q
```
Expected: all tests pass. Capture pass count for later comparison.

- [ ] **Step 5: Run baseline frontend typecheck**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake/frontend
npm run typecheck
```
Expected: zero errors.

**Do NOT commit anything in Task 0.**

---

## Phase A — Backend data model & prompt helpers

### Task 1: Add `values` field to `Profile`

**Files:**
- Modify: `backend/app/models/profile.py`
- Test: `backend/tests/test_profile_model.py` (create new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_profile_model.py`:

```python
import pytest
from pydantic import ValidationError

from app.models.profile import Profile

DYAD_KEYS = {
    "respected_liked",
    "certainty_possibility",
    "honest_kind",
    "movement_roots",
    "life_scope",
}


def _base_profile_kwargs() -> dict:
    return {
        "name": "Sam",
        "age": 32,
        "occupation": "lawyer",
        "workHours": 60,
        "topGoal": "x",
        "topFear": "y",
        "targetYear": 2046,
        "presentYear": 2026,
    }


def test_profile_accepts_valid_values_dict() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={
            "respected_liked": "liked",
            "certainty_possibility": "possibility",
            "honest_kind": "kind",
            "movement_roots": "movement",
            "life_scope": "smaller_well",
        },
    )
    assert p.values is not None
    assert p.values["respected_liked"] == "liked"


def test_profile_drops_unknown_dyad_keys() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={
            "respected_liked": "liked",
            "bogus_key": "anything",
        },
    )
    assert p.values == {"respected_liked": "liked"}


def test_profile_drops_invalid_side_value() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={
            "respected_liked": "loved",  # not a valid side for this dyad
            "honest_kind": "kind",
        },
    )
    assert p.values == {"honest_kind": "kind"}


def test_profile_values_empty_after_filter_becomes_none() -> None:
    p = Profile(
        **_base_profile_kwargs(),
        values={"bogus": "stuff"},
    )
    assert p.values is None


def test_profile_values_optional() -> None:
    p = Profile(**_base_profile_kwargs())
    assert p.values is None


def test_profile_mbti_still_optional() -> None:
    p = Profile(**_base_profile_kwargs(), mbti="INTJ")
    assert p.mbti == "INTJ"
    p2 = Profile(**_base_profile_kwargs(), mbti="not-a-type")
    assert p2.mbti is None  # invalid input normalizes to None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_profile_model.py -v
```
Expected: failures because `values` field does not exist yet.

- [ ] **Step 3: Implement the field and validator**

Replace `backend/app/models/profile.py` with:

```python
from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


VALID_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
})

# Allowed sides for each dyad slug. The keys here are the canonical dyad
# identifiers; values are the two sides the user can pick. Anything else is
# dropped by the validator below.
VALID_VALUES_DYADS: dict[str, frozenset[str]] = {
    "respected_liked": frozenset({"respected", "liked"}),
    "certainty_possibility": frozenset({"certainty", "possibility"}),
    "honest_kind": frozenset({"honest", "kind"}),
    "movement_roots": frozenset({"movement", "roots"}),
    "life_scope": frozenset({"smaller_well", "bigger_okay"}),
}


class Profile(BaseModel):
    """Mirrors frontend `src/types.ts` Profile exactly. Field names are camelCase
    on the wire to match the TS contract; we keep them as Python attributes too."""

    model_config = {"populate_by_name": True}

    name: str
    age: int = Field(ge=0, le=120)
    occupation: str
    workHours: int = Field(ge=0, le=168)
    topGoal: str
    topFear: str
    targetYear: int
    presentYear: int
    mbti: Optional[str] = None
    values: Optional[Dict[str, str]] = None

    @field_validator("mbti", mode="before")
    @classmethod
    def _normalize_mbti(cls, v):
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        v = v.strip().upper()
        if not v:
            return None
        return v if v in VALID_MBTI else None

    @field_validator("values", mode="before")
    @classmethod
    def _normalize_values(cls, v):
        if v is None:
            return None
        if not isinstance(v, dict):
            return None
        cleaned: dict[str, str] = {}
        for key, side in v.items():
            if not isinstance(key, str) or not isinstance(side, str):
                continue
            allowed = VALID_VALUES_DYADS.get(key)
            if allowed and side in allowed:
                cleaned[key] = side
        return cleaned or None
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_profile_model.py -v
```
Expected: all 6 tests pass.

- [ ] **Step 5: Run full backend test suite to ensure no regressions**

```bash
pytest -q
```
Expected: all tests pass (unchanged from baseline plus the 6 new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/profile.py backend/tests/test_profile_model.py
git commit -m "feat(profile): add values dyad field with lenient validator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add prompt-rendering helpers for MBTI and values

**Files:**
- Modify: `backend/app/prompts/orchestration.py` (add two helper functions, no other edits this task)
- Test: `backend/tests/test_personality_prompt_blocks.py` (create new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_personality_prompt_blocks.py`:

```python
from app.models.profile import Profile
from app.prompts.orchestration import _mbti_block, _values_block


def _profile(**overrides) -> Profile:
    base = {
        "name": "Sam",
        "age": 32,
        "occupation": "lawyer",
        "workHours": 60,
        "topGoal": "x",
        "topFear": "y",
        "targetYear": 2046,
        "presentYear": 2026,
    }
    base.update(overrides)
    return Profile(**base)


def test_mbti_block_present() -> None:
    p = _profile(mbti="INTJ")
    out = _mbti_block(p)
    assert "INTJ" in out
    assert out.startswith("\n")  # block is meant to inline-append to a list


def test_mbti_block_absent_when_unset() -> None:
    p = _profile()
    assert _mbti_block(p) == ""


def test_values_block_renders_chosen_sides() -> None:
    p = _profile(values={
        "respected_liked": "liked",
        "certainty_possibility": "possibility",
        "honest_kind": "kind",
        "movement_roots": "movement",
        "life_scope": "smaller_well",
    })
    out = _values_block(p)
    # Loose contract: must mention each chosen side word and frame as "X over Y".
    assert "liked" in out.lower() and "respected" in out.lower()
    assert "over" in out.lower()
    assert "smaller life done well" in out.lower() or "smaller_well" in out.lower()


def test_values_block_partial_input_renders_only_present() -> None:
    p = _profile(values={"honest_kind": "kind"})
    out = _values_block(p)
    assert "kind" in out.lower() and "honest" in out.lower()
    # No mention of any other dyad's side words.
    assert "liked" not in out.lower()
    assert "possibility" not in out.lower()


def test_values_block_absent_when_unset() -> None:
    p = _profile()
    assert _values_block(p) == ""
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_personality_prompt_blocks.py -v
```
Expected: ImportError — the helpers don't exist yet.

- [ ] **Step 3: Add the helpers**

Add this block to the bottom of `backend/app/prompts/orchestration.py` (just before the existing `# ---` divider that ends the file, or at the absolute end). It defines two private helpers and the dyad-side display labels so prompts render in plain English.

```python
# ---------------------------------------------------------------------------
# Personality prompt blocks (MBTI + values). Empty string when absent so they
# inline-append safely into existing prompt skeletons.

# Pretty labels for each dyad side, used to render the values block in
# natural language. Keys must match VALID_VALUES_DYADS in models/profile.py.
_DYAD_LABELS: dict[str, dict[str, str]] = {
    "respected_liked": {"respected": "respected", "liked": "liked"},
    "certainty_possibility": {"certainty": "certainty", "possibility": "possibility"},
    "honest_kind": {"honest": "honest", "kind": "kind"},
    "movement_roots": {"movement": "movement", "roots": "roots"},
    "life_scope": {
        "smaller_well": "a smaller life done well",
        "bigger_okay": "a bigger life done okay",
    },
}

# The "other side" of a dyad — used for "X over Y" rendering.
_DYAD_OTHER: dict[str, dict[str, str]] = {
    "respected_liked": {"respected": "liked", "liked": "respected"},
    "certainty_possibility": {
        "certainty": "possibility", "possibility": "certainty"
    },
    "honest_kind": {"honest": "kind", "kind": "honest"},
    "movement_roots": {"movement": "roots", "roots": "movement"},
    "life_scope": {
        "smaller_well": "bigger_okay", "bigger_okay": "smaller_well"
    },
}


def _mbti_block(profile: Profile) -> str:
    """Returns '\n- MBTI: INTJ' or '' (so it can append after another bullet)."""
    if not profile.mbti:
        return ""
    return f"\n- MBTI: {profile.mbti}"


def _values_block(profile: Profile) -> str:
    """Render the user's value dyad picks as one inline bullet, or '' if none.

    Format: '\n- values (forced-choice): leans LIKED over respected, ...'
    Only renders dyads whose chosen side is recognized; silently drops the rest.
    """
    if not profile.values:
        return ""
    parts: list[str] = []
    for slug, side in profile.values.items():
        labels = _DYAD_LABELS.get(slug)
        others = _DYAD_OTHER.get(slug)
        if not labels or not others or side not in labels:
            continue
        chosen = labels[side]
        loser_slug = others[side]
        loser = labels[loser_slug]
        parts.append(f"{chosen.upper()} over {loser}")
    if not parts:
        return ""
    return "\n- values (forced-choice): leans " + ", ".join(parts)
```

Note: `Profile` is already imported at the top of `orchestration.py` (line 15) — no new import needed.

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_personality_prompt_blocks.py -v
```
Expected: all 5 tests pass.

- [ ] **Step 5: Run full backend test suite**

```bash
pytest -q
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/prompts/orchestration.py backend/tests/test_personality_prompt_blocks.py
git commit -m "feat(prompts): add MBTI + values render helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the personality blocks into all four orchestration `render_*_user` functions

**Files:**
- Modify: `backend/app/prompts/orchestration.py` (four `render_*_user` functions)
- Test: `backend/tests/test_personality_prompt_blocks.py` (extend with integration assertions)

- [ ] **Step 1: Extend the test file with integration assertions**

Append to `backend/tests/test_personality_prompt_blocks.py`:

```python
from app.models.orchestration import AgentSpec, OutlineEvent
from app.prompts.orchestration import (
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_planning_user,
)


def _agent() -> AgentSpec:
    return AgentSpec(
        agent_id="user", role="user", name="Sam",
        relationship="the protagonist", voice="lived-in",
    )


def _outline_event() -> OutlineEvent:
    return OutlineEvent(
        year=2030, severity=0.5,
        primary_actors=["user"], visibility=["user"],
        hint="something happens",
    )


def test_counting_user_includes_mbti_and_values_when_present() -> None:
    p = _profile(mbti="INTJ", values={"honest_kind": "kind"})
    out = render_counting_user(p)
    assert "INTJ" in out
    assert "values (forced-choice)" in out
    assert "KIND over honest" in out


def test_counting_user_omits_personality_when_absent() -> None:
    p = _profile()
    out = render_counting_user(p)
    assert "MBTI" not in out
    assert "values (forced-choice)" not in out


def test_planning_user_includes_values() -> None:
    p = _profile(mbti="INTJ", values={"movement_roots": "movement"})
    out = render_planning_user(p, [_agent()], "state-block", "pool-block")
    assert "INTJ" in out
    assert "MOVEMENT over roots" in out


def test_branched_planning_user_includes_values() -> None:
    p = _profile(mbti="ENFP", values={"certainty_possibility": "possibility"})
    out = render_branched_planning_user(
        p, [_agent()], "state-block", "pool-block",
        intervention={"year": 2030, "text": "I quit"},
        kept_block="(none)",
    )
    assert "ENFP" in out
    assert "POSSIBILITY over certainty" in out


def test_detail_user_includes_mbti_and_values() -> None:
    p = _profile(mbti="ISTP", values={"life_scope": "smaller_well"})
    out = render_detail_user(
        p, [_agent()], [_outline_event()], [], [_outline_event()]
    )
    assert "ISTP" in out
    assert "smaller life done well" in out.lower()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_personality_prompt_blocks.py -v
```
Expected: the 5 new integration tests fail (current `render_*_user` functions don't include the values block; counting and detail also don't include MBTI yet).

- [ ] **Step 3: Patch `render_counting_user`**

Replace the body of `render_counting_user` in `backend/app/prompts/orchestration.py` (currently around lines 82–93) with:

```python
def render_counting_user(profile: Profile) -> str:
    return f"""\
Profile:
- name: {profile.name}
- age: {profile.age}
- occupation: {profile.occupation}
- work hours per week: {profile.workHours}
- top goal: {profile.topGoal}
- top fear: {profile.topFear}
- target year: {profile.targetYear} (present year: {profile.presentYear}){_mbti_block(profile)}{_values_block(profile)}

Output the agent list as strict JSON only."""
```

- [ ] **Step 4: Patch `render_planning_user`**

In the same file (around lines 285–364), find the line that builds `mbti_line`:

```python
    mbti_line = f"\n- MBTI: {profile.mbti}" if profile.mbti else ""
```

Replace `mbti_line` usage in the f-string with `_mbti_block(profile)` and append `_values_block(profile)` to the `horizon` line. The full updated function:

```python
def render_planning_user(
    profile: Profile,
    agents: list[AgentSpec],
    initial_state_block: str,
    pool_block: str,
    intervention: Optional[dict] = None,
) -> str:
    agent_lines = "\n".join(
        f"- {a.agent_id} ({a.role}): {a.name} — {a.relationship}" for a in agents
    )
    intervention_block = ""
    if intervention and intervention.get("text"):
        iv_year = int(intervention.get("year", profile.presentYear))
        iv_text = str(intervention["text"]).strip()
        intervention_block = f"""

# USER INTERVENTION (this is decisive — bake it in completely)

At year {iv_year}, the user has stated they would have done THIS instead:

  "{iv_text}"

This is not a suggestion. It is the choice they make at year {iv_year}. \
Treat it as fact and rebuild the trajectory around it. Specifically:

1. Years BEFORE {iv_year} unfold normally per the state-evolution rules \
above. Don't change them just because of the intervention.

2. AT year {iv_year}, the intervention IS the event of that year. Whatever \
might otherwise have fired at that year (from the pool or organic) is \
replaced or overridden by this choice. The event card for year {iv_year} \
should describe THIS act, named honestly.

3. AFTER {iv_year}, every subsequent event must trace from this choice. \
The state vector should jump in response to the intervention's nature \
(financial pressure, family distance, career momentum, relationship \
strain — all may shift sharply). Subsequent events should be different \
from a non-intervention trajectory: people may enter or leave the user's \
life, opportunities open or close, certain pool events become impossible \
and others become inevitable.

4. Costs are real. The intervention does NOT make life better by default. \
Show second-order consequences. Some closed doors do not reopen. Some \
agents in the graph may stop appearing entirely (estranged, gone, dead, \
moved on). Some new agents may enter (a new partner, a new mentor, a \
court-appointed counselor, a parole officer — whatever the choice implies).

5. If the intervention is small ("I sleep more", "I call my sister weekly"): \
the ripples are small but real. Don't pretend a tiny choice changes \
everything. Don't pretend it changes nothing.

6. If the intervention is extreme (illegal, violent, harmful, drastic): \
the consequences must be proportionate. Arrest, trial, severed \
relationships, lasting trauma, the long arc that follows. Treat it with \
weight; don't sanitize into a "lesson learned" fable. (If model safety \
prevents detailed depiction of certain acts, narrate the *consequences* \
honestly even if the act itself is referenced obliquely.)

7. The world's macro events (recession, AI displacement, climate, etc.) \
still happen on their own timing. They just land differently on a \
person making a different choice."""
    return f"""\
Profile:
- name: {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}
- top goal: {profile.topGoal}
- top fear: {profile.topFear}
- horizon: {profile.presentYear} to {profile.targetYear} ({profile.targetYear - profile.presentYear} years)

Agents in this person's life:
{agent_lines}

# INITIAL STATE (year {profile.presentYear})
{initial_state_block}

# CURATED EVENT POOL (filtered to this horizon)
{pool_block}{intervention_block}

Walk the simulation year by year, applying drift and firing armed events. \
Output ONLY the strict JSON for the outline."""
```

The lone `mbti_line = ...` assignment in this function is removed (the helper replaces it).

- [ ] **Step 5: Patch `render_branched_planning_user`**

In the same file (around lines 199–282), apply the same swap. The full updated function:

```python
def render_branched_planning_user(
    profile: Profile,
    agents: list[AgentSpec],
    initial_state_block: str,
    pool_block: str,
    intervention: dict,
    kept_block: str,
) -> str:
    """Planner prompt for the BRANCHED case — events before intervention_year
    are FIXED (already happened); only plan events at or after that year."""
    iv_year = int(intervention["year"])
    iv_text = str(intervention["text"]).strip()
    agent_lines = "\n".join(
        f"- {a.agent_id} ({a.role}): {a.name} — {a.relationship}" for a in agents
    )
    return f"""\
Profile:
- name: {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}
- top goal: {profile.topGoal}
- top fear: {profile.topFear}
- horizon: {profile.presentYear} to {profile.targetYear}
- INTERVENTION YEAR: {iv_year} (you plan ONLY events for years {iv_year} through {profile.targetYear})

Agents in this person's life:
{agent_lines}

# INITIAL STATE (year {profile.presentYear})
{initial_state_block}

# EVENTS THAT ALREADY HAPPENED (years {profile.presentYear}–{iv_year - 1})
These are FIXED. Do NOT reproduce them. Treat them as the trajectory the user \
already lived; their state evolution shaped the present. The user's accumulated \
state, agent relationships, and life context as of year {iv_year} all derive \
from these events.

{kept_block}

# CURATED EVENT POOL (filtered to this horizon)
{pool_block}

# USER INTERVENTION (this is decisive — bake it in completely)

At year {iv_year}, the user has stated they would have done THIS:

  "{iv_text}"

This is not a suggestion. It is the choice they make at year {iv_year}. The \
trajectory from year {iv_year} onward must reflect this choice. Specifically:

1. The FIRST event you produce MUST be at year {iv_year} and MUST describe \
the intervention. The hint should reference the user's stated act directly.

2. Every subsequent event must trace from this choice's consequences. State \
evolution should jump in response to the intervention's nature (financial, \
relational, professional, legal — whatever applies). The agent graph may \
shift: people enter or leave the user's life as a result.

3. Costs are real. The intervention does NOT auto-improve life. Show second-\
order consequences. Some closed doors do not reopen.

4. If the intervention is small (e.g., "I sleep more"): ripples are small \
but real. Don't pretend a tiny choice changes everything.

5. If the intervention is extreme (illegal, violent, harmful): consequences \
must be proportionate — arrest, severed relationships, lasting trauma, the \
long arc that follows. Treat it with weight; don't sanitize. (If model \
safety prevents detailed depiction of certain acts, narrate the *consequences* \
honestly even if the act itself is referenced obliquely.)

6. World macro events (recession, AI displacement, climate, etc.) still \
happen on their own timing. They land differently on a person making a \
different choice.

# Output rules (apply on top of the system rules above)

- Years STRICTLY between {iv_year} and {profile.targetYear} (inclusive both).
- Never produce events for years before {iv_year}.
- First event year: exactly {iv_year} (the intervention itself).
- Last event year: exactly {profile.targetYear}.
- Event count: 3 to {max(3, 12 - max(0, iv_year - profile.presentYear) // 2)} inclusive — adapt to remaining horizon.
- Apply the spacing rules from the system prompt: don't grid; allow 4+ year gaps.

Output ONLY the strict JSON for the outline."""
```

The lone `mbti_line = ...` assignment is removed.

- [ ] **Step 6: Patch `render_detail_user`**

In the same file (around lines 417–463), update the function. The full updated version:

```python
def render_detail_user(
    profile: Profile,
    agents: list[AgentSpec],
    full_outline: list[OutlineEvent],
    completed: list[Checkpoint],
    batch: list[OutlineEvent],
) -> str:
    agent_lines = "\n".join(
        f"- {a.agent_id} ({a.role}): {a.name} — {a.relationship}. Voice: {a.voice}"
        for a in agents
    )
    outline_lines = "\n".join(
        f"  {i+1}. year {o.year} (severity {o.severity:.2f}): {o.hint} "
        f"[actors: {','.join(o.primary_actors)}; visible to: {','.join(o.visibility)}]"
        for i, o in enumerate(full_outline)
    )
    completed_lines = (
        "\n".join(
            f"  - {c.year}: {c.title} — {c.consequence}" for c in completed
        )
        if completed
        else "  (none yet)"
    )
    batch_lines = "\n".join(
        f"  - year {o.year} (sev {o.severity:.2f}): {o.hint} "
        f"[actors: {','.join(o.primary_actors)}; visible to: {','.join(o.visibility)}]"
        for o in batch
    )
    return f"""\
Profile:
- {profile.name}, age {profile.age}, {profile.occupation}, {profile.workHours} hrs/wk{_mbti_block(profile)}{_values_block(profile)}
- top goal: {profile.topGoal}
- top fear: {profile.topFear}

Agents:
{agent_lines}

Full event outline:
{outline_lines}

Already-written checkpoints:
{completed_lines}

Write THESE checkpoints (one per outline entry below, in order):
{batch_lines}

Output the JSON array only."""
```

- [ ] **Step 7: Run test to verify it passes**

```bash
pytest tests/test_personality_prompt_blocks.py -v
```
Expected: all tests pass (the original 5 unit tests + 5 integration tests = 10 total).

- [ ] **Step 8: Run full backend test suite**

```bash
pytest -q
```
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/app/prompts/orchestration.py backend/tests/test_personality_prompt_blocks.py
git commit -m "feat(prompts): wire MBTI and values blocks into orchestration prompts

Inject into render_counting_user, render_planning_user,
render_branched_planning_user, and render_detail_user. Finalize is left
as-is — it works from the lived trajectory which already encodes the
personalization.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add tone-block clauses (use values + compression-as-dignity)

**Files:**
- Modify: `backend/app/prompts/orchestration.py` (TONE_BLOCK string only)

- [ ] **Step 1: Locate `TONE_BLOCK`**

Open `backend/app/prompts/orchestration.py`. The `TONE_BLOCK` is currently lines 21–30 (the literal `TONE_BLOCK = """..."""`).

- [ ] **Step 2: Update the string**

Replace the existing `TONE_BLOCK = """..."""` with:

```python
TONE_BLOCK = """\
# Tone (carries across every output)

- Serious, contemplative, lived-in. Not cheerful, not despairing.
- The world is hard: economic instability, AI disruption, climate stress, real \
losses people don't plan for. Treat these as baseline, not edge cases.
- Concrete and specific. A Tuesday, a kitchen counter, the way someone laughed.
- Compassionate but direct. Compassionate is not the same as softening.
- Never motivational. No "you've got this." No "anything is possible."
- When the user faces a choice inside a checkpoint, weight their reaction by \
their stated values and MBTI when present, not by archetype.
- Compression is part of dignity. Say the thing once, in the fewest true words.
"""
```

- [ ] **Step 3: Verify the file still parses**

```bash
cd backend && source .venv/bin/activate
python -c "from app.prompts.orchestration import TONE_BLOCK; print(TONE_BLOCK)"
```
Expected: prints the updated tone block including the two new bullets. No syntax errors.

- [ ] **Step 4: Run full backend test suite**

```bash
pytest -q
```
Expected: all tests pass (TONE_BLOCK is interpolated into multiple system prompts, so this would fail loudly if anything broke).

- [ ] **Step 5: Commit**

```bash
git add backend/app/prompts/orchestration.py
git commit -m "feat(prompts): add tone clauses for personality weighting and compression

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — Verbosity tightening

### Task 5: Tighten `DETAIL_SYSTEM` per-card length specs

**Files:**
- Modify: `backend/app/prompts/orchestration.py` (DETAIL_SYSTEM string only)

- [ ] **Step 1: Locate `DETAIL_SYSTEM`**

In `backend/app/prompts/orchestration.py`, find `DETAIL_SYSTEM` (around line 370). The relevant lines are 380–386:

```python
- title: 4–10 words, evocative, no trailing period. Often a definite-article \
construction ("The promotion you took because you couldn't say no", "The \
first cardiologist appointment", "Your sister's wedding, on Zoom").
- event: 1–2 sentences. What happened. If agents speak, name them and quote them.
- did: 1 sentence. What the user did. Specific verb, specific moment.
- consequence: 1–2 sentences. What followed. Can be poetic. Lands the moment.
- tone: "warn" | "neutral" | "good" — match severity (high severity often warn).
```

- [ ] **Step 2: Replace those six bullet lines with tightened versions**

Use `Edit` to replace the block above with:

```python
- title: 4–8 words, evocative, no trailing period. Often a definite-article \
construction ("The promotion you couldn't say no to", "The first cardiologist \
appointment", "Your sister's wedding, on Zoom").
- event: 1 sentence. What happened. If agents speak, name them and quote briefly.
- did: 1 sentence, ≤15 words. What the user did. Specific verb, specific moment.
- consequence: 1 sentence. What followed. Can be poetic. Lands the moment.
- tone: "warn" | "neutral" | "good" — match severity (high severity often warn).
```

- [ ] **Step 3: Verify the file still parses**

```bash
cd backend && source .venv/bin/activate
python -c "from app.prompts.orchestration import DETAIL_SYSTEM; assert '4–8 words' in DETAIL_SYSTEM; assert '≤15 words' in DETAIL_SYSTEM; print('ok')"
```
Expected: prints `ok`.

- [ ] **Step 4: Run full backend test suite**

```bash
pytest -q
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/prompts/orchestration.py
git commit -m "refactor(prompts): tighten checkpoint card length budget

title 4-10→4-8 words; event 1-2→1 sentence; did capped at 15 words;
consequence 1-2→1 sentence. Cards drop from up to ~5 sentences to ~3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tighten `FINALIZE_SYSTEM` future-self length specs

**Files:**
- Modify: `backend/app/prompts/orchestration.py` (FINALIZE_SYSTEM string only)

- [ ] **Step 1: Locate `FINALIZE_SYSTEM`**

In `backend/app/prompts/orchestration.py`, find `FINALIZE_SYSTEM` (around line 469). The relevant block is roughly lines 474–495.

- [ ] **Step 2: Update the future-self length specs**

Use `Edit` to replace this passage:

```
1. futureSelfOpening — 35–70 words. Voiced. The simulated future self sitting \
down to talk with their present self for the first time. Starts mid-thought \
(NOT "Hello"). Lean PHILOSOPHICAL — not narrative recap. The voice of someone \
who has spent twenty years thinking about what twenty years means. A question \
they carry. An observation about time, choice, attention, or what they didn't \
know they were choosing. One concrete detail from the lived trajectory may \
appear, but framed as reflection, not exposition. Read like a Joan Didion or \
Annie Ernaux paragraph — interior, weighted, exact. Not motivational. Not \
plot summary.

Bad: "I'm older now. I took the promotion in 2027 and it changed everything."
Good: "Nobody tells you that the years are not the unit. The unit is what \
you stopped noticing. There's a Tuesday in 2031 I didn't know was a turning \
point until I was forty-three. That's the part to listen for."

2. futureSelfReplies — exactly three keys, exactly these strings:
   - "What did I get wrong?"
   - "Am I happy?"
   - "What should I change?"
   Each value: 50–100 words. In the future-self voice. Specific. Reference \
events from the trajectory by detail (not by name). For "What should I \
change?" give 1–3 concrete actionable nudges grounded in the trajectory, \
not generic advice.
```

with:

```
1. futureSelfOpening — 25–45 words. Voiced. The simulated future self sitting \
down to talk with their present self for the first time. Starts mid-thought \
(NOT "Hello"). Lean PHILOSOPHICAL — not narrative recap. An observation about \
time, choice, attention, or what they didn't know they were choosing. One \
concrete detail from the lived trajectory may appear, framed as reflection. \
Read like a Joan Didion paragraph — interior, weighted, exact. Distilled, not \
clipped. Not motivational. Not plot summary.

Bad: "I'm older now. I took the promotion in 2027 and it changed everything."
Good: "Nobody tells you the years aren't the unit. The unit is what you \
stopped noticing. There's a Tuesday in 2031 I didn't know was a turning point \
until I was forty-three."

2. futureSelfReplies — exactly three keys, exactly these strings:
   - "What did I get wrong?"
   - "Am I happy?"
   - "What should I change?"
   Each value: 35–60 words. In the future-self voice. Specific. Reference \
events from the trajectory by detail (not by name). For "What should I \
change?" give 1–3 concrete actionable nudges grounded in the trajectory, \
not generic advice. Distilled, not clipped.
```

- [ ] **Step 3: Verify the file still parses**

```bash
cd backend && source .venv/bin/activate
python -c "from app.prompts.orchestration import FINALIZE_SYSTEM; assert '25–45 words' in FINALIZE_SYSTEM; assert '35–60 words' in FINALIZE_SYSTEM; print('ok')"
```
Expected: prints `ok`.

- [ ] **Step 4: Run full backend test suite**

```bash
pytest -q
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/prompts/orchestration.py
git commit -m "refactor(prompts): tighten future-self length budget

Opening 35-70→25-45 words; each canned reply 50-100→35-60 words.
Total future-self text drops ~half.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Strip the alternate phase

### Task 7: Remove `ALTERNATE_SYSTEM`, `render_alternate_user`, `_alternate()`, and the `checkpointsLow` field

**Files:**
- Modify: `backend/app/prompts/orchestration.py` (delete two definitions)
- Modify: `backend/app/services/orchestrator.py` (remove imports, two task-gather sites, helper fn)
- Modify: `backend/app/models/simulation.py` (delete `checkpointsLow`)
- Modify: `backend/app/prompts/future_self.py` (drop the alternate-version paragraph)

- [ ] **Step 1: Delete `ALTERNATE_SYSTEM` and `render_alternate_user` from `orchestration.py`**

Open `backend/app/prompts/orchestration.py`. Delete the entire section starting at the `# ---` divider for `ALTERNATE` (line ~533) through the end of `render_alternate_user` (line ~574). That includes:
- The comment header `# ALTERNATE — checkpointsLow ...`
- `ALTERNATE_SYSTEM = f"""..."""` block
- `def render_alternate_user(...)` function

The personality-block helpers added in Task 2 (which sit AFTER this section if you appended them at the end) must remain.

- [ ] **Step 2: Strip alternate from `orchestrator.py` imports**

Open `backend/app/services/orchestrator.py`. Find the import block at lines 21–33:

```python
from app.prompts.orchestration import (
    ALTERNATE_SYSTEM,
    COUNTING_SYSTEM,
    DETAIL_SYSTEM,
    FINALIZE_SYSTEM,
    PLANNING_SYSTEM,
    render_alternate_user,
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_finalize_user,
    render_planning_user,
)
```

Replace with:

```python
from app.prompts.orchestration import (
    COUNTING_SYSTEM,
    DETAIL_SYSTEM,
    FINALIZE_SYSTEM,
    PLANNING_SYSTEM,
    render_branched_planning_user,
    render_counting_user,
    render_detail_user,
    render_finalize_user,
    render_planning_user,
)
```

- [ ] **Step 3: Patch `stream_simulation` (the non-branched path)**

In `orchestrator.py`, find the section starting at line 91. Replace:

```python
        # 4. Finalize + alternate path in parallel — both depend only on `completed`.
        # Emit an explicit phase so the frontend can show progress instead of
        # appearing to stall after the last event lands.
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))
        alternate_task = asyncio.create_task(_alternate(profile, completed, router))
        final_payload, alternate_cps = await asyncio.gather(finalize_task, alternate_task)
```

with:

```python
        # 4. Finalize. Emit an explicit phase so the frontend can show progress
        # instead of appearing to stall after the last event lands.
        yield {"phase": "finalizing"}
        final_payload = await _finalize(profile, agents, completed, router)
```

Then update the `SimulationData` construction further down (line 116–123). Replace:

```python
        sim = SimulationData(
            profile=profile,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

with:

```python
        sim = SimulationData(
            profile=profile,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

Then update the `_fan_out_portraits` call further down (line 127–131). Replace:

```python
            async for ev in _fan_out_portraits(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, low=alternate_cps, ages=ages,
            ):
                yield ev
```

with:

```python
            async for ev in _fan_out_portraits(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, ages=ages,
            ):
                yield ev
```

(`_fan_out_portraits` itself is updated in Step 5 below.)

- [ ] **Step 4: Patch `stream_branched_simulation` (the branched path)**

In `orchestrator.py`, find the same pattern around lines 290–294. Replace:

```python
        # 5. Finalize + alternate over the FULL trajectory (kept + new).
        yield {"phase": "finalizing"}
        finalize_task = asyncio.create_task(_finalize(profile, agents, completed, router))
        alternate_task = asyncio.create_task(_alternate(profile, completed, router))
        final_payload, alternate_cps = await asyncio.gather(finalize_task, alternate_task)
```

with:

```python
        # 5. Finalize over the FULL trajectory (kept + new).
        yield {"phase": "finalizing"}
        final_payload = await _finalize(profile, agents, completed, router)
```

Then the `SimulationData` construction at line 313–320. Replace:

```python
        sim = SimulationData(
            profile=profile,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            checkpointsLow=alternate_cps,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

with:

```python
        sim = SimulationData(
            profile=profile,
            agedPortraits=hero_portraits,
            checkpointsHigh=completed,
            futureSelfOpening=final_payload["futureSelfOpening"],
            futureSelfReplies=final_payload["futureSelfReplies"],
        )
```

Then the `_fan_out_portraits_branched` call (line 324–330). Replace:

```python
            async for ev in _fan_out_portraits_branched(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, low=alternate_cps, ages=ages_b,
                intervention=intervention,
                original_portraits=original_simulation.agedPortraits,
            ):
                yield ev
```

with:

```python
            async for ev in _fan_out_portraits_branched(
                profile=profile, selfie_bytes=selfie_bytes, selfie_mime=selfie_mime,
                high=completed, ages=ages_b,
                intervention=intervention,
                original_portraits=original_simulation.agedPortraits,
            ):
                yield ev
```

- [ ] **Step 5: Update `_fan_out_portraits` to drop the `low` parameter**

In `orchestrator.py`, find `_fan_out_portraits` (line ~505). Replace its full body with:

```python
async def _fan_out_portraits(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    high: list[Checkpoint],
    ages: list[int],
) -> AsyncIterator[dict]:
    """Fire one Gemini call per high-trajectory anchor — 5 total — and yield
    each result as it lands. Failures are emitted as 'portrait_error' events.
    Successes are emitted as 'portrait' events with the AgedPortrait inline.
    Concurrency is capped via PORTRAIT_CONCURRENCY to avoid per-minute 429s."""
    span = profile.targetYear - profile.presentYear
    sem = asyncio.Semaphore(PORTRAIT_CONCURRENCY)

    def _events_up_to(cps: list[Checkpoint], year: int) -> list[Checkpoint]:
        return [c for c in cps if c.year <= year]

    async def _one(index: int, age: int) -> dict:
        year = profile.presentYear + round(span * (index / 4))
        async with sem:
            portrait = await generate_aged_portrait(
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                profile=profile,
                target_age=age,
                target_year=year,
                trajectory="high",
                relevant_events=_events_up_to(high, year),
            )
        if portrait.imageUrl is None:
            return {
                "phase": "portrait_error",
                "trajectory": "high",
                "index": index,
                "message": "image generation failed",
            }
        return {
            "phase": "portrait",
            "trajectory": "high",
            "index": index,
            "portrait": portrait.model_dump(),
        }

    # The hero portrait (final-year, high trajectory) is generated by the
    # caller BEFORE phase: "complete" so it's already in the SimulationData
    # payload. Skip it here to avoid duplicating it via mergePortrait.
    hero_idx = len(ages) - 1

    tasks = [
        asyncio.create_task(_one(i, age))
        for i, age in enumerate(ages)
        if i != hero_idx
    ]

    for coro in asyncio.as_completed(tasks):
        yield await coro
```

- [ ] **Step 6: Update `_fan_out_portraits_branched` to drop the `low` parameter**

In `orchestrator.py`, find `_fan_out_portraits_branched` (line ~565). Replace its full body with:

```python
async def _fan_out_portraits_branched(
    *,
    profile: Profile,
    selfie_bytes: bytes,
    selfie_mime: str,
    high: list[Checkpoint],
    ages: list[int],
    intervention: dict,
    original_portraits: list[AgedPortrait],
) -> AsyncIterator[dict]:
    """Branched-mode portrait fan-out.

    - High portraits with year < intervention['year'] are preserved verbatim
      from `original_portraits` and re-emitted with their original index.
    - High portraits with year >= intervention['year'] are regenerated."""
    iv_year = int(intervention["year"])
    span = profile.targetYear - profile.presentYear

    def _events_up_to(cps: list[Checkpoint], year: int) -> list[Checkpoint]:
        return [c for c in cps if c.year <= year]

    # Lookup table for preserved high portraits (year -> portrait).
    by_year_high = {p.year: p for p in original_portraits if p.trajectory == "high"}
    sem = asyncio.Semaphore(PORTRAIT_CONCURRENCY)

    preserved_indices: set[int] = set()
    for i, _age in enumerate(ages):
        year = profile.presentYear + round(span * (i / 4))
        if year < iv_year and year in by_year_high:
            yield {
                "phase": "portrait",
                "trajectory": "high",
                "index": i,
                "portrait": by_year_high[year].model_dump(),
            }
            preserved_indices.add(i)

    async def _one(index: int, age: int) -> dict:
        year = profile.presentYear + round(span * (index / 4))
        async with sem:
            portrait = await generate_aged_portrait(
                selfie_bytes=selfie_bytes,
                selfie_mime=selfie_mime,
                profile=profile,
                target_age=age,
                target_year=year,
                trajectory="high",
                relevant_events=_events_up_to(high, year),
            )
        if portrait.imageUrl is None:
            return {
                "phase": "portrait_error",
                "trajectory": "high",
                "index": index,
                "message": "image generation failed",
            }
        return {
            "phase": "portrait",
            "trajectory": "high",
            "index": index,
            "portrait": portrait.model_dump(),
        }

    # Hero (final-year high) is generated by the caller BEFORE phase: "complete".
    hero_idx = len(ages) - 1

    tasks = [
        asyncio.create_task(_one(i, age))
        for i, age in enumerate(ages)
        if i not in preserved_indices and i != hero_idx
    ]

    for coro in asyncio.as_completed(tasks):
        yield await coro
```

- [ ] **Step 7: Delete `_alternate()` from `orchestrator.py`**

Find `async def _alternate(...)` at line ~467 and delete the entire function (through line ~487, ending with `return [_correct_age(cp, profile) for cp in cps]`).

- [ ] **Step 8: Remove `checkpointsLow` from `SimulationData`**

Open `backend/app/models/simulation.py`. Replace the entire file with:

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
    agedPortraits: list[AgedPortrait]            # up to 5 entries (high trajectory)
    checkpointsHigh: list[Checkpoint]            # current-trajectory path
    futureSelfOpening: str                       # voiced reveal line
    futureSelfReplies: dict[str, str]            # 3 canned Q→A pairs
```

- [ ] **Step 9: Drop the alternate paragraph from `future_self.py`**

Open `backend/app/prompts/future_self.py`. Find lines 54–55:

```
There was an alternate version of you who made different choices. You don't \
dwell on her — but you know she existed.
```

Delete those two lines entirely. Verify the surrounding paragraphs still flow naturally (the section above is "The years between then and now: {checkpoints_summary}" and below is "# Length & format" — removing the alternate paragraph leaves a clean break, which is fine).

- [ ] **Step 10: Verify backend imports and types**

```bash
cd backend && source .venv/bin/activate
python -c "
from app.services.orchestrator import stream_simulation, stream_branched_simulation
from app.models.simulation import SimulationData
import inspect
src = inspect.getsource(SimulationData)
assert 'checkpointsLow' not in src, src
print('ok')
"
```
Expected: prints `ok`. No ImportError, no AttributeError.

- [ ] **Step 11: Grep to confirm no straggling references**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake
grep -rn "checkpointsLow\|ALTERNATE_SYSTEM\|render_alternate_user\|_alternate\b" backend/app
```
Expected: zero results.

- [ ] **Step 12: Commit**

```bash
git add backend/app/prompts/orchestration.py backend/app/prompts/future_self.py backend/app/services/orchestrator.py backend/app/models/simulation.py
git commit -m "refactor: remove dead alternate-trajectory phase

No frontend screen reads checkpointsLow. The backend was running an
extra Sonnet call (~3-6s) on every simulation gathered with finalize.
Drop _alternate(), ALTERNATE_SYSTEM, render_alternate_user, the low
parameter on portrait fan-out, and the checkpointsLow field on
SimulationData. Future-self prompt loses its alternate-version paragraph.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Update backend tests that reference `checkpointsLow`

**Files:**
- Modify: `backend/tests/test_simulate_endpoint.py`
- Modify: `backend/tests/test_portrait_model.py`

- [ ] **Step 1: Patch `test_simulate_endpoint.py`**

Open `backend/tests/test_simulate_endpoint.py`. Find the `fake_stream` function at line ~17. Remove the `"checkpointsLow": []` line from the simulation payload:

```python
        yield {"phase": "complete", "simulation": {
            "profile": profile.model_dump(),
            "agedPortraits": [],
            "checkpointsHigh": [],
            "futureSelfOpening": "x",
            "futureSelfReplies": {},
        }}
```

- [ ] **Step 2: Patch `test_portrait_model.py`**

Open `backend/tests/test_portrait_model.py`. Find the `checkpointsLow=[cp],` line (around line 30) and remove it. (If removing it requires adjusting surrounding kwargs/commas, do so — the surrounding fields should still construct a valid `SimulationData`.)

- [ ] **Step 3: Run the test suite**

```bash
cd backend && source .venv/bin/activate
pytest -q
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_simulate_endpoint.py backend/tests/test_portrait_model.py
git commit -m "test: drop checkpointsLow from test fixtures

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — Frontend types & cleanup

### Task 9: Update frontend types and seed data

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/data.ts`
- Modify: `frontend/src/App.tsx` (one status string)

- [ ] **Step 1: Update `types.ts`**

Open `frontend/src/types.ts`. Replace the `Profile` and `SimulationData` interfaces with:

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
  mbti?: string | null;
  values?: Record<string, string> | null;
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
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
}
```

(Leave the existing `Tone`, `Trajectory`, `AgentSpec`, `OutlineEvent`, and `StreamEvent` definitions untouched.)

- [ ] **Step 2: Drop `checkpointsLow` from `data.ts` seed**

Open `frontend/src/data.ts`. Find the `checkpointsLow: [` block (around line 88) and delete it through its matching `],` (the entire array including all entries). Make sure the surrounding object is still valid (commas and braces match).

After deletion, verify the seed `SimulationData` object compiles by reading the file in your editor — it should now have `profile`, `agedPortraits`, `checkpointsHigh`, `futureSelfOpening`, `futureSelfReplies` (matching the trimmed type).

- [ ] **Step 3: Update the status string in `App.tsx`**

Open `frontend/src/App.tsx`. Find line 257:

```ts
            setLatestTitle("weaving the threads — the alternate path, the voice");
```

Replace with:

```ts
            setLatestTitle("weaving the threads — the voice");
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake/frontend
npm run typecheck
```
Expected: zero errors. If a screen file references `checkpointsLow`, fix it — but per the spec investigation, no screen does.

- [ ] **Step 5: Grep frontend for stragglers**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake
grep -rn "checkpointsLow" frontend/src
```
Expected: zero results.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/data.ts frontend/src/App.tsx
git commit -m "refactor(frontend): drop checkpointsLow type and seed; trim status copy

Add optional mbti and values to Profile type so they can ride on the
/simulate request once the intake form is updated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Frontend intake UI

### Task 10: Add MBTI and dyads spec data to `screens-a.tsx`

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

- [ ] **Step 1: Add the dyad spec data and MBTI list**

Open `frontend/src/screens/screens-a.tsx`. Find the `IntakeField` type definition (around line 180). Just BEFORE that type, insert:

```tsx
type DyadSide = { slug: string; label: string };
type DyadSpec = { slug: string; left: DyadSide; right: DyadSide };

const VALUES_DYADS: DyadSpec[] = [
  {
    slug: "respected_liked",
    left: { slug: "respected", label: "Respected" },
    right: { slug: "liked", label: "Liked" },
  },
  {
    slug: "certainty_possibility",
    left: { slug: "certainty", label: "Certainty" },
    right: { slug: "possibility", label: "Possibility" },
  },
  {
    slug: "honest_kind",
    left: { slug: "honest", label: "Honest" },
    right: { slug: "kind", label: "Kind" },
  },
  {
    slug: "movement_roots",
    left: { slug: "movement", label: "Movement" },
    right: { slug: "roots", label: "Roots" },
  },
  {
    slug: "life_scope",
    left: { slug: "smaller_well", label: "A smaller life done well" },
    right: { slug: "bigger_okay", label: "A bigger life done okay" },
  },
];

const MBTI_TYPES: string[] = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];
```

- [ ] **Step 2: Extend the `IntakeField` union**

Just below those constants, replace the existing `IntakeField` type:

```tsx
type IntakeField =
  | { key: keyof Profile; label: string; placeholder: string; type: "text" | "textarea"; suffix?: string }
  | { key: keyof Profile; label: string; placeholder: string; type: "number"; suffix?: string };
```

with the extended version:

```tsx
type IntakeField =
  | { key: keyof Profile; label: string; placeholder: string; type: "text" | "textarea"; suffix?: string }
  | { key: keyof Profile; label: string; placeholder: string; type: "number"; suffix?: string }
  | { key: "mbti"; label: string; type: "mbti"; suffix?: string }
  | { key: "values"; label: string; type: "dyads"; dyads: DyadSpec[]; suffix?: string };
```

- [ ] **Step 3: Insert the new entries into `INTAKE_FIELDS`**

Find the existing `INTAKE_FIELDS` declaration (line ~184). Insert the MBTI and dyads entries between `topFear` and `targetYear`. The full updated array:

```tsx
const INTAKE_FIELDS: IntakeField[] = [
  { key: "name", label: "What should I call you?", placeholder: "Your name", type: "text" },
  { key: "age", label: "How old are you, today?", placeholder: "32", type: "number" },
  { key: "occupation", label: "What do you do for work?", placeholder: "Marketing director", type: "text" },
  { key: "workHours", label: "Hours per week, honestly.", placeholder: "65", type: "number" },
  {
    key: "topGoal",
    label: "What do you want, more than anything?",
    placeholder: "Build something I'm proud of before forty",
    type: "textarea",
  },
  {
    key: "topFear",
    label: "What are you afraid of?",
    placeholder: "Looking up at fifty and realizing I optimized for the wrong thing",
    type: "textarea",
  },
  {
    key: "mbti",
    label: "Your MBTI, if you know it.",
    type: "mbti",
    suffix: "Skip if you don't. It's optional — a hint, not a label.",
  },
  {
    key: "values",
    label: "Pick one in each pair. There's no right answer — just yours.",
    type: "dyads",
    dyads: VALUES_DYADS,
  },
  {
    key: "targetYear",
    label: "How many years should I look ahead?",
    placeholder: "20",
    type: "number",
    suffix: "Twenty feels right. Five if you want it close. Thirty if you want to see far.",
  },
];
```

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: errors will appear because `ScreenIntake` doesn't render the new types yet — that's fine; we'll fix in Tasks 11–12. Save the error list to confirm only the expected ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(intake): add VALUES_DYADS, MBTI_TYPES, and IntakeField shapes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Render the MBTI step in `ScreenIntake`

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

- [ ] **Step 1: Branch the render based on `cur.type`**

Open `frontend/src/screens/screens-a.tsx`. Locate `ScreenIntake` (around line 216). The render block currently does `{cur.type === "textarea" ? <textarea/> : <input/>}` (lines ~339–369). We need to change this to a switch on `cur.type` covering text/number, textarea, mbti, and dyads.

First, derive `displayValue` only when applicable. Update the existing `displayValue` computation (around line 285) to skip for non-input types. Add this guard before its current expression:

```tsx
  const displayValue =
    cur.type === "mbti" || cur.type === "dyads"
      ? ""
      : cur.type === "number"
        ? value && Number(value) !== 0
          ? String(value)
          : ""
        : ((value as string | undefined) ?? "");
```

(`value` is computed earlier — for mbti and dyads we just don't use it via this path.)

Next, update the `useEffect` that auto-sizes the textarea (around line 294) so it only runs when `cur.type === "textarea"`:

```tsx
  useEffect(() => {
    if (cur.type === "textarea") autoSizeTextarea(textareaRef.current);
  }, [step, cur.type, displayValue]);
```

(That's already the case — verify it didn't change.)

- [ ] **Step 2: Replace the input/textarea ternary with a typed switch**

Find the `{cur.type === "textarea" ? (` block (line ~339). Replace it through the closing `)` (around line 369) with:

```tsx
          {cur.type === "textarea" ? (
            <textarea
              ref={textareaRef}
              className="field auto-grow"
              rows={1}
              autoFocus
              placeholder={cur.placeholder}
              value={displayValue}
              onChange={(e) => {
                autoSizeTextarea(e.currentTarget);
                applyValue(e.target.value, "type");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) next();
              }}
            />
          ) : cur.type === "mbti" ? (
            <MbtiPicker
              value={profile.mbti ?? null}
              onPick={(t) => setProfile({ ...profile, mbti: t })}
            />
          ) : cur.type === "dyads" ? (
            <DyadsPicker
              dyads={cur.dyads}
              value={profile.values ?? {}}
              onPick={(slug, side) =>
                setProfile({
                  ...profile,
                  values: { ...(profile.values ?? {}), [slug]: side },
                })
              }
            />
          ) : (
            <input
              className="field"
              autoFocus
              type={cur.type === "number" ? "text" : cur.type}
              inputMode={cur.type === "number" ? "numeric" : undefined}
              pattern={cur.type === "number" ? "[0-9]*" : undefined}
              placeholder={cur.placeholder}
              value={displayValue}
              onChange={(e) => applyValue(e.target.value, "type")}
              onKeyDown={(e) => {
                if (e.key === "Enter") next();
              }}
            />
          )}
```

- [ ] **Step 3: Hide the mic button on mbti and dyads steps**

A few lines below the input switch, find `<MicButton ... />`. Wrap it in a conditional so it only renders for text/textarea/number:

```tsx
          {cur.type !== "mbti" && cur.type !== "dyads" && (
            <MicButton
              onTranscript={(text) => applyValue(text, "voice")}
              onRecorded={(blob, durationMs) => {
                onRecorded(blob, durationMs);
                pushVoiceSample(blob);
              }}
            />
          )}
```

- [ ] **Step 4: Add the `MbtiPicker` component at the bottom of the file**

After the `ScreenIntake` function (and before any other top-level export), add:

```tsx
function MbtiPicker({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (mbti: string | null) => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {MBTI_TYPES.map((t) => {
          const selected = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(selected ? null : t)}
              className="under"
              style={{
                padding: "14px 0",
                fontFamily: "var(--mono)",
                fontSize: 15,
                letterSpacing: "0.06em",
                color: selected ? "var(--bg)" : "var(--ink-1)",
                background: selected ? "var(--ink-1)" : "transparent",
                border: "1px solid var(--ink-3)",
                borderRadius: 4,
                cursor: "pointer",
                transition:
                  "background 200ms var(--ease), color 200ms var(--ease)",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onPick(null)}
        className="under"
        style={{
          marginTop: 18,
          color: value == null ? "var(--ink-1)" : "var(--ink-3)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontStyle: "italic",
        }}
      >
        skip / clear
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add the `DyadsPicker` component**

Just below `MbtiPicker`, add:

```tsx
function DyadsPicker({
  dyads,
  value,
  onPick,
}: {
  dyads: DyadSpec[];
  value: Record<string, string>;
  onPick: (slug: string, side: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {dyads.map((d) => {
        const chosen = value[d.slug];
        const renderSide = (side: DyadSide) => {
          const selected = chosen === side.slug;
          return (
            <button
              key={side.slug}
              type="button"
              onClick={() => onPick(d.slug, side.slug)}
              style={{
                flex: 1,
                padding: "14px 18px",
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 18,
                color: selected ? "var(--bg)" : "var(--ink-1)",
                background: selected ? "var(--ink-1)" : "transparent",
                border: "1px solid var(--ink-3)",
                borderRadius: 4,
                cursor: "pointer",
                textAlign: "center",
                transition:
                  "background 200ms var(--ease), color 200ms var(--ease)",
              }}
            >
              {side.label}
            </button>
          );
        };
        return (
          <div key={d.slug} style={{ display: "flex", gap: 10 }}>
            {renderSide(d.left)}
            {renderSide(d.right)}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Block "Continue" until dyads are complete**

Find the `next()` function in `ScreenIntake` (around line 239):

```tsx
  function next() {
    tts.stop();
    if (step < INTAKE_FIELDS.length - 1) setStep(step + 1);
    else onContinue();
  }
```

Replace with:

```tsx
  function next() {
    if (cur.type === "dyads") {
      const picks = profile.values ?? {};
      const allAnswered = cur.dyads.every((d) => Boolean(picks[d.slug]));
      if (!allAnswered) return;
    }
    tts.stop();
    if (step < INTAKE_FIELDS.length - 1) setStep(step + 1);
    else onContinue();
  }
```

(The button stays clickable; the `next()` call is the gate. This keeps the button styling consistent with the rest of the form. If you want a visual disabled state, you can also add `opacity: 0.4` when the gate is closed — keep it simple for now.)

- [ ] **Step 7: Confirm the auto-play TTS still works for the new steps**

The existing `useEffect` at line ~225 plays `cur.label` over TTS in voice mode. It will work as-is for `mbti` and `dyads` (their labels are sentences). No change needed.

- [ ] **Step 8: Run typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: zero errors.

- [ ] **Step 9: Manual UI smoke test (no backend yet)**

```bash
cd frontend && npm run dev
```
Open `http://localhost:5173`, click into intake. Tab through to step 7 (MBTI) and step 8 (dyads). Verify:
- MBTI step shows a 4×4 grid of pills + "skip / clear". Clicking a pill highlights it; clicking again clears it. "Continue" advances regardless of selection.
- Dyads step shows 5 rows of two pills. Clicking left highlights left; clicking right swaps. "Continue" does nothing until all 5 are answered.
- Step counter reads `07 / 09` and `08 / 09`.

If anything visually breaks, fix before commit.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(intake): MBTI picker and values dyads steps

Two new ScreenIntake render branches: a 4x4 MBTI grid (with skip) and
a five-row dyad picker. Dyads gate the Continue button until all five
are answered. Mic button hidden on these steps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase F — Verification

### Task 12: Full backend test pass

**Files:** none (verification only)

- [ ] **Step 1: Run pytest**

```bash
cd backend && source .venv/bin/activate
pytest -q
```
Expected: all tests pass, including the new tests from Tasks 1, 2, and 3.

- [ ] **Step 2: Verify the dead-code grep**

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake
grep -rn "checkpointsLow" backend frontend/src 2>/dev/null
grep -rn "ALTERNATE_SYSTEM\|render_alternate_user" backend 2>/dev/null
grep -rn "_alternate\b" backend/app 2>/dev/null
```
Expected: zero results from each (or only matches inside CHANGELOG / spec docs, which are fine).

### Task 13: Frontend typecheck and dev-server smoke

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: zero errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```
Expected: build succeeds.

### Task 14: End-to-end smoke (backend + frontend together)

**Files:** none (manual verification)

This task requires `ANTHROPIC_API_KEY` to be set in `.env`.

- [ ] **Step 1: Start the backend**

In one terminal:

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake
./scripts/dev.sh
```
Expected: server up at `http://localhost:8000`. `http://localhost:8000/docs` shows the OpenAPI page; the `Profile` schema includes `mbti` and `values` as optional fields, and `SimulationData` does NOT include `checkpointsLow`.

- [ ] **Step 2: Start the frontend**

In a second terminal:

```bash
cd /Users/bensonlee/Projects/AlterEgo/.worktrees/personalized-intake/frontend
npm run dev
```

- [ ] **Step 3: Run the full flow with MBTI + dyads filled**

Open `http://localhost:5173`. Walk through intake answering all 9 steps with MBTI = "INTJ" and a complete dyad selection. After "begin →":

- Watch the processing screen. Expected: `counting → plan → event (×N) → finalizing → complete`. No mention of "alternate" in the status.
- On the reveal screen, observe the checkpoint cards. Spot-check: each card's `event`, `did`, and `consequence` should each be roughly one sentence. Total card height noticeably shorter than baseline.
- Click through to the chat screen. Verify `futureSelfOpening` plays/displays as ~25–45 words. Click "What did I get wrong?" — reply length ~35–60 words.

- [ ] **Step 4: Run the flow with MBTI skipped, dyads still required**

Reload, walk through intake, click "skip / clear" on MBTI, complete dyads. Confirm the simulation completes successfully (the `_mbti_block` returns `""` so the prompt doesn't include MBTI; `_values_block` still does).

- [ ] **Step 5: Speed comparison (optional)**

Compare wall-clock time from the moment "begin →" is clicked to the moment the reveal screen mounts. Expected: ~3–6 seconds faster than baseline (one fewer Sonnet call).

- [ ] **Step 6: Final commit if any frontend tweaks were needed**

If Task 14 surfaced minor UI issues, fix them and commit. Otherwise no commit.

---

## Plan summary

| Phase | Tasks | What ships |
|---|---|---|
| Pre-flight | 0 | Clean baseline, deps installed |
| A | 1–4 | Backend model + prompt helpers wired |
| B | 5–6 | Tighter card and future-self length budgets |
| C | 7–8 | Dead alternate phase deleted end-to-end |
| D | 9 | Frontend types updated |
| E | 10–11 | MBTI + dyads UI in intake |
| F | 12–14 | Verification: tests, typecheck, smoke |

Total tasks: 14. Most tasks are independent within their phase; Phases A → C → D → E → F have ordering dependencies. Phases B and C are mutually independent and could run in either order.

## Acceptance summary (matches spec §Acceptance criteria)

- ✅ Intake form has 9 steps; MBTI is skippable, dyads are not. (Tasks 10, 11)
- ✅ A `Profile` payload with `mbti` and `values` populated drives `/simulate`. (Task 14 Step 3)
- ✅ A `Profile` payload with neither populated still drives `/simulate`. (Task 14 Step 4)
- ✅ Per-card output ~3 sentences; future-self opening ≤45 words; replies ≤60 words. (Tasks 5, 6 + Task 14 Step 3)
- ✅ `grep "checkpointsLow"` across backend + frontend/src returns zero. (Task 12 Step 2)
- ✅ `grep "alternate"` across backend/app returns zero outside unrelated comments. (Task 12 Step 2)
- ✅ `npm run typecheck` passes. (Task 13)
- ✅ Reveal end-to-end faster by ~3–6s. (Task 14 Step 5)
