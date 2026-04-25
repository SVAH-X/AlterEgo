"""AlterEgo Fetch.ai uAgent.

Wraps the AlterEgo FastAPI backend in a Chat Protocol-compliant uAgent so it
can be reached through ASI:One. Runs in mailbox mode — Agentverse brokers the
messages, no public endpoint required.

Conversation flow:
    welcome      → greet the user, ask the first intake question
    intake (×7)  → collect name, age, occupation, workHours, topGoal,
                   topFear, yearsAhead
    simulating   → POST /simulate, narrate phases (counting / plan / events /
                   finalizing / complete) as they stream back
    interview    → free-form Q&A with the simulated future self via /chat
"""

from __future__ import annotations

import difflib
import json
import os
import re
from datetime import datetime
from typing import Any
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

AGENT_SEED = os.getenv("AGENT_SEED", "alterego-agent-seed-CHANGE-ME")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
AGENT_PORT = int(os.getenv("AGENT_PORT", "8001"))
PRESENT_YEAR = int(os.getenv("PRESENT_YEAR", "2026"))

agent = Agent(
    name="alterego",
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)
protocol = Protocol(spec=chat_protocol_spec)


# ---------------------------------------------------------------------------
# Intake script — one question per turn

INTAKE_FIELDS: list[tuple[str, str]] = [
    # Step 0's prompt lives in WELCOME; the message text below is unused for it.
    ("name", "What should I call you?"),
    (
        "age",
        "Hi {name}. Honest pleasure.\n\n"
        "How old are you today?",
    ),
    (
        "occupation",
        "{age} — got it.\n\n"
        "What do you do for work?",
    ),
    (
        "workHours",
        "OK. And how many hours a week do you actually put in? "
        "Honestly — not aspirationally.",
    ),
    (
        "mbti",
        "Got it.\n\n"
        "If you know your MBTI type, tell me — it tunes how I'll write you. "
        "Four letters, like INTJ or ENFP. If you don't know it, just say "
        "\"I don't know\" or \"skip\".",
    ),
    (
        "topGoal",
        "Now the harder one: what do you want, more than anything?",
    ),
    (
        "topFear",
        "Real wanting. The kind worth being honest about.\n\n"
        "And what are you afraid of?",
    ),
    (
        "yearsAhead",
        "That's a lot to carry. Thank you for telling me.\n\n"
        "Last question. How many years should I look ahead? Twenty is the "
        "usual answer; five if you want it close, thirty if you want to see far.",
    ),
]

VALID_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
})

MBTI_SKIP_PHRASES = frozenset({
    "skip", "idk", "no", "nope", "not sure", "dunno",
    "don't know", "dont know", "i don't know", "i dont know",
    "no idea", "haven't taken it", "havent taken it", "?", "n/a", "na",
})

WELCOME = (
    "I'm AlterEgo. I'll simulate where your current life is heading — "
    "honestly, not in motivational fluff — and then let you talk to your "
    "future self about what you find.\n\n"
    "Seven short questions. Then about 90 seconds of simulation. Then a "
    "conversation.\n\n"
    "What should I call you?\n\n"
    "_(Type \"restart\" anytime to wipe the session and begin a new simulation.)_"
)

INTERVIEW_NUDGE = (
    "I'm here. Ask me anything. If you're not sure where to start, try: "
    "\"What did I get wrong?\", \"Am I happy?\", or \"What should I change?\"\n\n"
    "_(Type \"restart\" anytime to leave this future and simulate a different one.)_"
)

RESET_TRIGGERS = {
    "/restart",
    "/reset",
    "restart",
    "reset",
    "start over",
    "begin again",
    "new simulation",
    "fresh start",
}


def is_reset_command(raw: str) -> bool:
    """Detect a reset request even with @mentions, punctuation, casing, or typos.

    Examples that all return True:
        "restart", "/restart", "RESTART!", "@alterego restart",
        "@alterego /reset", "start over", "@alterego start over.",
        "restrat", "rstart", "reset"  ← typos handled by fuzzy match
    """
    if not raw:
        return False
    text = raw.strip()
    # Strip a leading @mention (e.g. "@alterego ") if present.
    text = re.sub(r"^@\S+\s+", "", text, count=1)
    # Strip surrounding punctuation/whitespace and lowercase for comparison.
    text = text.strip().rstrip(".!?,;:").strip().lower()
    if not text:
        return False
    if text in RESET_TRIGGERS:
        return True
    # Tolerate common typos: "restrat", "rstart", "restart!" → "restart".
    # cutoff=0.78 catches single-character errors without firing on real
    # questions like "should i restart my career?" (which wouldn't be the
    # whole cleaned text anyway, but defensive).
    matches = difflib.get_close_matches(text, list(RESET_TRIGGERS), n=1, cutoff=0.78)
    return bool(matches)


# ---------------------------------------------------------------------------
# Per-sender state, stored as JSON in ctx.storage

def get_state(ctx: Context, sender: str) -> dict[str, Any]:
    raw = ctx.storage.get(sender)
    if not raw:
        return _fresh_state()
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return _fresh_state()
    if isinstance(raw, dict):
        return raw
    return _fresh_state()


def save_state(ctx: Context, sender: str, state: dict[str, Any]) -> None:
    ctx.storage.set(sender, json.dumps(state))


def _fresh_state() -> dict[str, Any]:
    return {
        "stage": "welcome",
        "profile": {"presentYear": PRESENT_YEAR},
        "intake_step": 0,
        "history": [],
        "simulation": None,
    }


# ---------------------------------------------------------------------------
# Helpers

async def say(ctx: Context, sender: str, text: str, end: bool = False) -> None:
    """Send a text message back to the sender."""
    content: list[Any] = [TextContent(type="text", text=text)]
    if end:
        content.append(EndSessionContent(type="end-session"))
    await ctx.send(
        sender,
        ChatMessage(
            timestamp=datetime.utcnow(),
            msg_id=uuid4(),
            content=content,
        ),
    )


_NUMBER_BOUNDS = {
    "age": (0, 120),
    "workHours": (0, 168),
    "yearsAhead": (1, 80),
}

# Sentinel returned for MBTI when the user explicitly opts out.
_SKIP = object()


def parse_intake_value(field: str, raw: str) -> Any:
    raw = raw.strip()
    if not raw:
        return None
    if field == "mbti":
        # User can skip; no MBTI is fine.
        if raw.lower().rstrip(".!?") in MBTI_SKIP_PHRASES:
            return _SKIP
        # Find any standalone 4-letter run that's a valid MBTI. This handles
        # both "INTJ" and chatty answers like "I'm an INTJ" or "ENFP-A".
        for m in re.finditer(r"[A-Za-z]{4}", raw):
            cand = m.group(0).upper()
            if cand in VALID_MBTI:
                return cand
        return None
    if field in _NUMBER_BOUNDS:
        # Pull the FIRST integer in the input (regex), not all digits jammed
        # together — "I'm 32 years and 6 months" should give 32, not 326.
        m = re.search(r"-?\d+", raw)
        if not m:
            return None
        try:
            value = int(m.group(0))
        except ValueError:
            return None
        lo, hi = _NUMBER_BOUNDS[field]
        if value < lo or value > hi:
            return None
        return value
    return raw


# ---------------------------------------------------------------------------
# Backend integration

async def stream_simulate(profile: dict[str, Any]):
    """Yield phase dicts from the backend's NDJSON /simulate stream."""
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream(
            "POST", f"{BACKEND_URL}/simulate", json=profile
        ) as r:
            if r.status_code >= 400:
                # Read the body so the agent can surface the validation error
                # rather than just "422 Unprocessable Entity".
                body = await r.aread()
                detail = body.decode("utf-8", errors="replace")[:500]
                raise RuntimeError(f"backend {r.status_code}: {detail}")
            async for line in r.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


async def call_chat(
    profile: dict[str, Any],
    simulation: dict[str, Any],
    history: list[dict[str, Any]],
    user_text: str,
) -> str:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{BACKEND_URL}/chat",
            json={
                "profile": profile,
                "simulation": simulation,
                "history": history,
                "user_text": user_text,
            },
        )
        r.raise_for_status()
        return r.json()["text"]


# ---------------------------------------------------------------------------
# Message handler — the state machine lives here

@protocol.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
    # Always acknowledge first.
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    has_start_session = any(
        isinstance(c, StartSessionContent) for c in msg.content
    )
    user_text = "".join(
        c.text for c in msg.content if isinstance(c, TextContent)
    ).strip()

    state = get_state(ctx, sender)

    # If a NEW chat session is starting and we already have progress for this
    # user, surface a welcome-back so they know they can continue or restart.
    # State is preserved either way — they just get the right context.
    if has_start_session and state["stage"] in ("intake", "interview", "simulating"):
        await _send_welcome_back(ctx, sender, state)
        if not user_text:
            return
        # Else fall through and process the text alongside the session start.

    # Empty text + welcome state: send the regular welcome and start intake.
    if not user_text:
        if state["stage"] == "welcome":
            await say(ctx, sender, WELCOME)
            state["stage"] = "intake"
            state["intake_step"] = 0
            save_state(ctx, sender, state)
        return

    # Reset commands work in any stage. Tolerate ASI:One's @mention prefix
    # ("@alterego restart"), trailing punctuation, casing.
    if is_reset_command(user_text):
        state = _fresh_state()
        state["stage"] = "intake"
        state["intake_step"] = 0
        save_state(ctx, sender, state)
        await say(ctx, sender, WELCOME)
        return

    stage = state.get("stage", "welcome")

    if stage == "welcome":
        # First user message: greet them and start intake on the next turn.
        await say(ctx, sender, WELCOME)
        state["stage"] = "intake"
        state["intake_step"] = 0
        save_state(ctx, sender, state)
        return

    if stage == "intake":
        await _handle_intake(ctx, sender, state, user_text)
        return

    if stage == "simulating":
        await say(
            ctx,
            sender,
            "Still simulating — give it a moment. I'll narrate the years as "
            "they emerge.",
        )
        return

    if stage == "interview":
        await _handle_interview(ctx, sender, state, user_text)
        return

    # Unknown stage — reset gently.
    await say(ctx, sender, "Something's off in my state. Type 'restart' to begin again.")


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    pass


async def _send_welcome_back(
    ctx: Context, sender: str, state: dict[str, Any]
) -> None:
    """Surface a context-aware reminder when a returning user opens a new chat.
    Doesn't mutate state — just informs."""
    name = state.get("profile", {}).get("name") or "there"
    stage = state.get("stage")

    if stage == "interview":
        await say(
            ctx,
            sender,
            f"Welcome back, {name}. We're still in the interview from your last "
            f"simulation — ask me anything, or type 'restart' to start a new one.",
        )
    elif stage == "intake":
        step = int(state.get("intake_step", 0))
        if step >= len(INTAKE_FIELDS):
            return
        _, prompt = INTAKE_FIELDS[step]
        await say(
            ctx,
            sender,
            f"Welcome back, {name}. We were on question {step + 1} of "
            f"{len(INTAKE_FIELDS)}: {prompt} (Type 'restart' to start over.)",
        )
    elif stage == "simulating":
        await say(
            ctx,
            sender,
            "Welcome back. The previous simulation was interrupted. "
            "Type 'restart' and we'll begin a new one.",
        )


# ---------------------------------------------------------------------------
# Stage handlers

async def _handle_intake(
    ctx: Context, sender: str, state: dict[str, Any], user_text: str
) -> None:
    step: int = state.get("intake_step", 0)
    if step >= len(INTAKE_FIELDS):
        # Already past intake — shouldn't happen, but guard.
        await _start_simulation(ctx, sender, state)
        return

    field, _ = INTAKE_FIELDS[step]
    value = parse_intake_value(field, user_text)
    if value is None:
        if field in _NUMBER_BOUNDS:
            lo, hi = _NUMBER_BOUNDS[field]
            await say(
                ctx,
                sender,
                f"I need a whole number between {lo} and {hi} for that one. Try again.",
            )
        elif field == "mbti":
            await say(
                ctx,
                sender,
                "I need a four-letter MBTI like INTJ, ENFP, or ISTP — "
                "or just say \"skip\" if you don't know yours.",
            )
        else:
            await say(ctx, sender, "I didn't catch that. Try again.")
        return

    # MBTI skip is the only "valid empty" — record nothing for that field.
    if value is _SKIP:
        state["profile"].pop("mbti", None)
    else:
        state["profile"][field] = value

    # yearsAhead → derive targetYear, drop the helper field.
    if field == "yearsAhead":
        years = max(1, int(value))
        state["profile"]["targetYear"] = state["profile"]["presentYear"] + years
        state["profile"].pop("yearsAhead", None)

    next_step = step + 1
    if next_step < len(INTAKE_FIELDS):
        state["intake_step"] = next_step
        save_state(ctx, sender, state)
        _, prompt_template = INTAKE_FIELDS[next_step]
        # Templates can reference fields collected earlier (e.g. {name},
        # {age}). Fall back to the raw template if a key is missing.
        try:
            prompt = prompt_template.format(**state["profile"])
        except (KeyError, ValueError, IndexError):
            prompt = prompt_template
        await say(ctx, sender, prompt)
        return

    # All fields collected — kick off the simulation.
    state["stage"] = "simulating"
    save_state(ctx, sender, state)
    await say(
        ctx,
        sender,
        "Got it. Building your simulation now — about 90 seconds. I'll "
        "narrate the years as they emerge.",
    )
    await _start_simulation(ctx, sender, state)


async def _start_simulation(
    ctx: Context, sender: str, state: dict[str, Any]
) -> None:
    profile = state["profile"]
    ctx.logger.info(f"submitting profile to backend: {profile}")
    present_year = int(profile.get("presentYear", 2026))
    target_year = int(profile.get("targetYear", present_year + 20))
    last_event_year: int | None = None

    try:
        async for ev in stream_simulate(profile):
            phase = ev.get("phase")
            if phase == "counting":
                await say(ctx, sender, _format_counting_message(ev))
            elif phase == "plan":
                outline = ev.get("outline", [])
                await say(
                    ctx,
                    sender,
                    f"Walking the years from **{present_year}** to **{target_year}**. "
                    f"{len(outline)} turning points, scattered across {target_year - present_year} years.\n\n"
                    f"_Here we go._",
                )
            elif phase == "event":
                cp = ev.get("checkpoint", {})
                year = int(cp.get("year", present_year))
                msg_text = _format_event_message(
                    cp, year=year, last_event_year=last_event_year, present_year=present_year
                )
                await say(ctx, sender, msg_text)
                last_event_year = year
            elif phase == "finalizing":
                await say(
                    ctx,
                    sender,
                    "_Stitching the voice you'll talk to. Pulling the years "
                    "forward through the throat. Almost there..._",
                )
            elif phase == "complete":
                sim = ev.get("simulation")
                if not isinstance(sim, dict):
                    raise RuntimeError("complete phase missing simulation")
                state["simulation"] = sim
                state["stage"] = "interview"
                state["history"] = []
                save_state(ctx, sender, state)

                # Dramatic transition — the agent literally becomes the
                # future self before the opening line lands.
                target_age = int(profile.get("age", 32)) + (target_year - present_year)
                await say(
                    ctx,
                    sender,
                    f"_It's done._\n\n"
                    f"_I close my eyes here in {present_year}, "
                    f"and open them in **{target_year}**._\n\n"
                    f"_I'm you now. {target_age} years old. Listen —_",
                )

                opening = sim.get("futureSelfOpening") or ""
                if opening:
                    await say(ctx, sender, opening)
                await say(ctx, sender, INTERVIEW_NUDGE)
                return
            elif phase == "error":
                raise RuntimeError(ev.get("message", "unknown simulator error"))
    except (httpx.HTTPError, RuntimeError) as e:
        state["stage"] = "intake"
        state["intake_step"] = 0
        save_state(ctx, sender, state)
        await say(
            ctx,
            sender,
            f"The simulation faltered: {e}. Type 'restart' and we can try again.",
        )


def _format_counting_message(ev: dict[str, Any]) -> str:
    """Render the counting phase with names for flavor."""
    agents = ev.get("agents", [])
    others = [a for a in agents if a.get("agent_id") != "user"]
    if not others:
        return f"Drafting the people in your life — {len(agents)} of them."
    sample = [a.get("name") or a.get("role", "?") for a in others[:5]]
    flavor = ", ".join(sample)
    more = len(others) - len(sample)
    if more > 0:
        flavor += f", and {more} more"
    return (
        f"Drafting the people in your life — {len(agents)} of them.\n\n"
        f"_{flavor}._"
    )


def _time_interlude(gap: int, is_first: bool) -> str:
    """A short italic line that conveys the years between events."""
    if is_first:
        if gap >= 5:
            return f"_The first {gap} years drift, mostly. Then —_\n\n"
        if gap >= 3:
            return "_A few years pass before anything turns. Then —_\n\n"
        if gap >= 1:
            return "_The first year, almost immediately —_\n\n"
        return ""
    if gap >= 5:
        return f"_{gap} quiet years pass. Then —_\n\n"
    if gap == 4:
        return "_Four years drift by._\n\n"
    if gap == 3:
        return "_Three years on..._\n\n"
    if gap == 2:
        return "_Two more years..._\n\n"
    if gap == 0:
        return "_The same year, before you have time to settle —_\n\n"
    return ""  # gap == 1 → no interlude, back-to-back feels right


def _format_event_message(
    cp: dict[str, Any], year: int, last_event_year: int | None, present_year: int
) -> str:
    """Render a single event with a contextual time interlude prefix."""
    if last_event_year is None:
        prefix = _time_interlude(year - present_year, is_first=True)
    else:
        prefix = _time_interlude(year - last_event_year, is_first=False)

    title = cp.get("title", "")
    event_text = cp.get("event", "")
    did = cp.get("did", "")
    consequence = cp.get("consequence", "")
    return (
        f"{prefix}"
        f"**{year}** — _{title}_\n\n"
        f"{event_text}\n\n"
        f"_{did}_\n\n"
        f"→ {consequence}"
    )


async def _handle_interview(
    ctx: Context, sender: str, state: dict[str, Any], user_text: str
) -> None:
    profile = state.get("profile") or {}
    simulation = state.get("simulation") or {}
    history = state.get("history") or []

    if not simulation:
        # Shouldn't happen — interview without simulation. Reset.
        state["stage"] = "intake"
        state["intake_step"] = 0
        save_state(ctx, sender, state)
        await say(ctx, sender, "I lost my memory. Let's start over.")
        await say(ctx, sender, WELCOME)
        return

    try:
        reply = await call_chat(profile, simulation, history, user_text)
    except httpx.HTTPError as e:
        await say(ctx, sender, f"I can't reach myself right now. ({e})")
        return

    history.append({"role": "user", "text": user_text})
    history.append({"role": "future", "text": reply})
    state["history"] = history
    save_state(ctx, sender, state)
    await say(ctx, sender, reply)


# ---------------------------------------------------------------------------

agent.include(protocol, publish_manifest=True)


if __name__ == "__main__":
    agent.run()
