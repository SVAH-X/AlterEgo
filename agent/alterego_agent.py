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

import json
import os
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
    ("name", "What should I call you?"),
    ("age", "How old are you today?"),
    ("occupation", "What do you do for work?"),
    ("workHours", "Hours per week, honestly?"),
    ("topGoal", "What do you want, more than anything?"),
    ("topFear", "What are you afraid of?"),
    (
        "yearsAhead",
        "How many years should I look ahead? Twenty is the usual answer; "
        "five if you want it close, thirty if you want to see far.",
    ),
]

WELCOME = (
    "I'm AlterEgo. I'll simulate where your current life is heading — "
    "honestly, not in motivational fluff — and then let you talk to your "
    "future self about what you find.\n\n"
    "Seven short questions. Then about 90 seconds of simulation. Then a "
    "conversation.\n\n"
    "What should I call you?"
)

INTERVIEW_NUDGE = (
    "I'm here. Ask me anything. If you're not sure where to start, try: "
    "\"What did I get wrong?\", \"Am I happy?\", or \"What should I change?\""
)

RESET_TRIGGERS = {"/restart", "/reset", "start over", "reset", "restart"}


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


def parse_intake_value(field: str, raw: str) -> Any:
    raw = raw.strip()
    if not raw:
        return None
    if field in ("age", "workHours", "yearsAhead"):
        # Accept "32", "32 years", "thirty-two-ish" → just grab digits.
        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            return None
        try:
            return int(digits)
        except ValueError:
            return None
    return raw


# ---------------------------------------------------------------------------
# Backend integration

async def stream_simulate(profile: dict[str, Any]):
    """Yield phase dicts from the backend's NDJSON /simulate stream."""
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream(
            "POST", f"{BACKEND_URL}/simulate", json=profile
        ) as r:
            r.raise_for_status()
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

    user_text = "".join(
        c.text for c in msg.content if isinstance(c, TextContent)
    ).strip()

    # Empty text: ignore (likely a session-start signal).
    if not user_text:
        state = get_state(ctx, sender)
        if state["stage"] == "welcome":
            await say(ctx, sender, WELCOME)
            state["stage"] = "intake"
            state["intake_step"] = 0
            save_state(ctx, sender, state)
        return

    state = get_state(ctx, sender)

    # Reset commands work in any stage.
    if user_text.lower() in RESET_TRIGGERS:
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
        await say(ctx, sender, "I need a number for that one. Try again.")
        return

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
        _, prompt = INTAKE_FIELDS[next_step]
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
    try:
        async for ev in stream_simulate(profile):
            phase = ev.get("phase")
            if phase == "counting":
                count = len(ev.get("agents", []))
                await say(
                    ctx,
                    sender,
                    f"Drafting the people in your life — {count} of them.",
                )
            elif phase == "plan":
                outline = ev.get("outline", [])
                await say(
                    ctx,
                    sender,
                    f"Planning the years ahead — {len(outline)} events outlined.",
                )
            elif phase == "event":
                cp = ev.get("checkpoint", {})
                year = cp.get("year", "?")
                title = cp.get("title", "")
                event_text = cp.get("event", "")
                did = cp.get("did", "")
                consequence = cp.get("consequence", "")
                msg_text = (
                    f"**{year} — {title}**\n"
                    f"{event_text}\n"
                    f"_{did}_\n"
                    f"{consequence}"
                )
                await say(ctx, sender, msg_text)
            elif phase == "finalizing":
                await say(
                    ctx,
                    sender,
                    "Stitching it together — the alternate path, the voice…",
                )
            elif phase == "complete":
                sim = ev.get("simulation")
                if not isinstance(sim, dict):
                    raise RuntimeError("complete phase missing simulation")
                state["simulation"] = sim
                state["stage"] = "interview"
                state["history"] = []
                save_state(ctx, sender, state)
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
