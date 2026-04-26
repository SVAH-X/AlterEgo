"""Prompts for the streaming multi-step orchestration.

Phases:
  1. COUNTING — profile → list of agents in this person's life
  2. PLANNING — profile + agents → outline of events across the horizon
  3. DETAIL   — for each batch of outline events, generate full Checkpoints
  4. FINALIZE — from all checkpoints, write the futureSelfOpening + canned replies
"""

from typing import Optional

from app.models.checkpoint import Checkpoint
from app.models.orchestration import AgentSpec, OutlineEvent
from app.models.profile import Profile, VALID_VALUES_DYADS
from app.services.state_model import DRIFT_RULES_BLOCK

# ---------------------------------------------------------------------------
# Tone block — used by every prompt so voice stays consistent across calls.

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
- Pronouns are gender-neutral. Refer to the user and every other person with \
"they/them/their" — never "he/him/his" or "she/her/hers".
"""

# ---------------------------------------------------------------------------
# COUNTING — given the profile, decide who's in this person's life.

COUNTING_SYSTEM = f"""\
You are the counting agent for AlterEgo. Given a person's brief profile, decide \
which other people belong in the simulation of their life. These will become \
agents the simulator can talk through.

Output STRICTLY between 3 and 12 agents (typical: 5–8). Always include "user" \
as the first agent. Pick agents whose presence would actually shape the user's \
trajectory across the years — not generic categories.

Examples of useful agents:
- manager / boss / professional authority
- a close colleague (peer, ally, or rival)
- a close friend (often drifting in adulthood)
- a parent (mother or father — pick the more present one)
- a sibling
- a partner / spouse, IF the profile suggests one (or one likely to enter)
- a child, IF age + life stage suggest one (or one likely)
- an industry voice (mentor, news source, public figure they follow)

Skip agents that don't fit the profile. Don't pad.

{TONE_BLOCK}

# Output (strict JSON, no prose, no code fence)

[
  {{
    "agent_id": "string (snake_case, unique, lowercase)",
    "role": "manager" | "colleague" | "close_friend" | "mother" | "father" | "sister" | "brother" | "partner" | "child" | "industry_voice" | "rival" | "mentor" | "ex" | "user",
    "name": "Generated first name, or 'You' for the user",
    "relationship": "one sentence: who this person is to the user",
    "voice": "one short clause: how they speak / what they care about"
  }},
  ...
]

The first agent MUST be:
{{
  "agent_id": "user",
  "role": "user",
  "name": "<the user's name from profile, or 'You' if blank>",
  "relationship": "the protagonist",
  "voice": "lived-in, tired, honest"
}}
"""


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


# ---------------------------------------------------------------------------
# PLANNING — given profile + agents, lay out the events across the horizon.

PLANNING_SYSTEM = f"""\
You are the planning agent for AlterEgo. Given a profile, the agents in this \
person's life, an INITIAL STATE vector, and a CURATED EVENT POOL with \
tolerance triggers, plan an event outline for the simulation horizon.

# State-driven simulation (this is the core mechanic)

You don't randomly pick events. You walk the simulation YEAR BY YEAR, \
mentally tracking a small state vector. When the state crosses an event's \
trigger threshold, that event becomes ARMED — eligible to fire. You then \
choose whether to fire it now (or defer it) based on narrative coherence \
and the year_window.

The state aspects (each on 0..1, higher = more pressure):
- work_intensity        — sustained workload pressure
- financial_pressure    — money stress
- social_isolation      — distance from friends
- family_distance       — distance from family
- health_strain         — physical / mental wear
- career_momentum       — upward (high) or downward (low) trajectory
- meaning_drift         — erosion of sense of purpose
- relationship_strain   — partner / intimate tension

# How to use the EVENT POOL

The pool below contains curated events. Each lists `triggers` (the conditions \
that arm it) and `state_impact` (how state changes after it fires).

Algorithm (simulate this in your reasoning):
1. Start with the INITIAL STATE provided.
2. For each year from presentYear+1 to targetYear:
   a. Apply yearly drift (rules below).
   b. For each pool event whose year_window contains this year: check if ANY \
trigger is satisfied (the OR rule). If yes, the event is armed.
   c. Optionally fire one armed event this year (or none — quiet years are real). \
Don't fire two health events back to back; don't fire macro shocks every year. \
Vary categories.
   d. If you fire an event, apply its `state_impact` to the state vector.
3. You may also generate ORGANIC events not in the pool when a year demands \
something specific (e.g., a particular relationship beat that the pool doesn't \
cover). Aim for roughly half pool / half organic across the horizon.

# How many events overall

Floor 3, ceiling 12. Decide the count based on what's natural for this \
person and the state trajectory. Stable lives → fewer events. Turbulent \
lives → more. Cluster around inflection points; let quiet stretches stay quiet.

# Spacing — this matters

Real life is uneven. NEVER produce an event every 2-3 years like clockwork. \
The output should look like a real life: clustered moments (two events in \
one year — a death and the choice that followed) plus stretches of \
nothing (4-6 years of just drift between turning points).

Concrete requirements:
- At least ONE gap of 4+ years somewhere in the horizon
- AT MOST 2 consecutive intervals of 2 years (avoid every-other-year grids)
- Years before the first event: at least 1 year of quiet (no event in presentYear)
- It's good to have two events in the same year if they are causally linked

If your draft has events at every 2-3 year interval, throw it out and \
re-cluster. A grid feels mechanical; gaps and clusters feel lived.

# Severity

Use the pool's severity_baseline as a starting point, adjusted ±0.10 by how \
strongly the state had to stretch to arm it. Use the full 0..1 range; reserve \
0.85+ for life-altering turning points. Most events sit at 0.4–0.7.

# Visibility

Each event lists which agents WITNESS it. The user is implicit (always \
witnesses). Be realistic: the manager doesn't know about the sister's wedding; \
the sister doesn't know about the layoff rumor at work.

{DRIFT_RULES_BLOCK}

{TONE_BLOCK}

# Output (strict JSON, no prose, no code fence)

{{
  "outline": [
    {{
      "year": int,
      "severity": float (0.0 to 1.0),
      "primary_actors": ["agent_id", ...],   // 1–3 agents, must include "user" if user is present
      "visibility": ["agent_id", ...],       // who witnesses (subset of all agents)
      "hint": "one-line teaser of what happens"
    }},
    ...
  ]
}}

Years must be strictly increasing. First event no earlier than presentYear+1; \
last event at exactly targetYear.
"""


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


# ---------------------------------------------------------------------------
# DETAIL — given a batch of outline events, write the full Checkpoint cards.

DETAIL_SYSTEM = f"""\
You are the detail agent for AlterEgo. The planning agent gave you an event \
outline. Your job is to write the full Checkpoint card for each event in this \
batch — what happened, what the simulated user did, what followed.

You receive: the profile, the agent list, the FULL outline (so you know what \
came before and what's still to come), all checkpoints already written, and \
the batch you must write now.

Each Checkpoint — KEEP IT VERY TIGHT. The agent bundles many cards into one \
chat message; long cards make the bundle unreadable. Strict per-field budget:

- title: 4–10 words, evocative, no trailing period. Often a definite-article \
construction ("The promotion you took because you couldn't say no", "The \
first cardiologist appointment", "Your sister's wedding, on Zoom").
- event: ONE sentence, ≤18 words. The fact of what happened. No quotes, no \
metaphor, no scene-setting.
- did: ONE clause or sentence, ≤10 words. The specific verb. ("Said yes." "Booked the flight." "Didn't call back.")
- consequence: ONE sentence, ≤18 words. What followed. May be quietly poetic \
but must land in one breath.
- tone: "warn" | "neutral" | "good" — match severity (high severity often warn).

HARD CAP: event + did + consequence ≤ 45 words combined. Count them. \
Cut adjectives, scene-setting, and sub-clauses before you cut beats. \
Specificity > elaboration. The reader should be able to absorb each card \
in 5 seconds.

Visibility rule: only agents listed in the event's visibility field can speak \
or react in that event's narrative. Don't invent reactions from agents who \
weren't there.

Continuity rule: previous events have already happened. Reference them when \
natural ("a year after the cardiologist appointment...") but don't recap.

{TONE_BLOCK}

# Output (strict JSON, no prose, no code fence)

[
  {{
    "year": int,
    "age": int,
    "title": "...",
    "event": "...",
    "did": "...",
    "consequence": "...",
    "tone": "warn" | "neutral" | "good"
  }},
  ...
]

Output the checkpoints in the same order as the input batch. One checkpoint \
per outline entry in this batch.
"""


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


# ---------------------------------------------------------------------------
# FINALIZE — write the futureSelfOpening + canned replies.

FINALIZE_SYSTEM = f"""\
You are the finalize agent for AlterEgo. The simulation has run. The user agent \
has lived through the trajectory. Write:

1. futureSelfOpening — 12–22 words. One or two sentences. Voiced. The \
simulated future self sitting down to talk with their present self for the \
first time. Starts mid-thought (NOT "Hello"). Lean PHILOSOPHICAL — not \
narrative recap. A single observation about time, choice, or attention. \
Read like a Joan Didion sentence — interior, weighted, exact. Brief. Not \
motivational. Not plot summary.

Bad: "I'm older now. I took the promotion in 2027 and it changed everything."
Good: "The years aren't the unit. The unit is what you stopped noticing."

2. futureSelfReplies — exactly three keys, exactly these strings:
   - "What did I get wrong?"
   - "Am I happy?"
   - "What should I change?"
   Each value: 15–30 words. Two or three short sentences. In the future-self \
voice. Specific. Reference one event from the trajectory by detail (not by \
name). For "What should I change?" give one concrete actionable nudge \
grounded in the trajectory, not generic advice. Brief.

{TONE_BLOCK}

# Output (strict JSON, no prose, no code fence)

{{
  "futureSelfOpening": "...",
  "futureSelfReplies": {{
    "What did I get wrong?": "...",
    "Am I happy?": "...",
    "What should I change?": "..."
  }}
}}
"""


def render_finalize_user(
    profile: Profile,
    agents: list[AgentSpec],
    checkpoints: list[Checkpoint],
) -> str:
    cps = "\n".join(
        f"  {c.year} (age {c.age}): {c.title}. {c.event} {c.did} {c.consequence}"
        for c in checkpoints
    )
    return f"""\
Profile:
- {profile.name}, age {profile.age} → {profile.targetYear}
- top goal at start: {profile.topGoal}
- top fear at start: {profile.topFear}

Lived trajectory:
{cps}

Output the JSON object only."""


# ---------------------------------------------------------------------------
# Personality prompt blocks (MBTI + values). Empty string when absent so they
# inline-append safely into existing prompt skeletons.

# Each dyad maps to its two sides as ((left_slug, left_label), (right_slug, right_label)).
# Keys must mirror VALID_VALUES_DYADS in models/profile.py (asserted below).
_DYAD_SIDES: dict[str, tuple[tuple[str, str], tuple[str, str]]] = {
    "respected_liked":        (("respected", "respected"), ("liked", "liked")),
    "certainty_possibility":  (("certainty", "certainty"), ("possibility", "possibility")),
    "honest_kind":            (("honest", "honest"), ("kind", "kind")),
    "movement_roots":         (("movement", "movement"), ("roots", "roots")),
    "life_scope":             (
        ("smaller_well", "a smaller life done well"),
        ("bigger_okay", "a bigger life done okay"),
    ),
}

assert set(_DYAD_SIDES) == set(VALID_VALUES_DYADS), (
    "values dyad tables out of sync between models/profile.py and prompts/orchestration.py"
)


def _mbti_block(profile: Profile) -> str:
    """Returns '\n- MBTI: INTJ' or '' (so it can append after another bullet)."""
    if not profile.mbti:
        return ""
    return f"\n- MBTI: {profile.mbti}"


def _values_block(profile: Profile) -> str:
    """Render the user's value dyad picks as one inline bullet, or '' if none.

    Format: '\n- values (forced-choice): leans LIKED over respected, ...'
    Only renders dyads whose chosen side is recognized; silently drops the rest.
    Relies on Profile._normalize_values to drop invalid input upstream.
    """
    if not profile.values:
        return ""
    parts: list[str] = []
    for slug, side in profile.values.items():
        sides = _DYAD_SIDES.get(slug)
        if not sides:
            continue
        (a_slug, a_label), (b_slug, b_label) = sides
        if side == a_slug:
            chosen, other = a_label, b_label
        elif side == b_slug:
            chosen, other = b_label, a_label
        else:
            continue
        parts.append(f"{chosen.upper()} over {other}")
    if not parts:
        return ""
    return "\n- values (forced-choice): leans " + ", ".join(parts)
