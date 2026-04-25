"""AlterEgo Fetch.ai uAgent sidecar.

Mailbox mode — no public endpoint needed. Agentverse acts as the broker.
Forwards chat messages to the FastAPI backend and returns responses.
"""

import os
from datetime import datetime
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
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
AGENT_PORT = int(os.getenv("AGENT_PORT", "8001"))

agent = Agent(
    name="alterego",
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)

protocol = Protocol(spec=chat_protocol_spec)


@protocol.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
    # Acknowledge receipt immediately
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(), acknowledged_msg_id=msg.msg_id),
    )

    user_text = "".join(c.text for c in msg.content if isinstance(c, TextContent))
    if not user_text.strip():
        return

    # TODO: route based on conversation state (intake / simulation / interview).
    # For now, treat every message as an interview turn against an existing session.
    reply_text, end_session = await _forward_to_backend(sender, user_text)

    content: list = [TextContent(type="text", text=reply_text)]
    if end_session:
        content.append(EndSessionContent(type="end-session"))

    await ctx.send(
        sender,
        ChatMessage(
            timestamp=datetime.utcnow(),
            msg_id=uuid4(),
            content=content,
        ),
    )


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    pass


async def _forward_to_backend(session_id: str, user_text: str) -> tuple[str, bool]:
    """Forward to FastAPI backend.

    TODO: real session management (track session_id by sender, route to
    intake -> simulation -> interview based on conversation state).
    """
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(
                f"{BACKEND_URL}/interview",
                json={"session_id": session_id, "user_text": user_text, "voice": False},
            )
            if r.status_code == 200:
                data = r.json()
                return data["text"], False
            return (
                f"AlterEgo backend returned {r.status_code}. "
                f"This conversation surface isn't fully wired yet — try the web app at /alterego.life.",
                True,
            )
        except httpx.HTTPError as e:
            return f"Could not reach AlterEgo backend: {e}", True


agent.include(protocol, publish_manifest=True)


if __name__ == "__main__":
    agent.run()
