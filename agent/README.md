# AlterEgo Fetch.ai uAgent

A Chat Protocol-compliant uAgent that wraps the AlterEgo FastAPI backend so the full simulation experience is reachable through **ASI:One**. Runs in **mailbox mode** — Agentverse brokers messages, so no public endpoint is needed.

## What this agent does

It runs the full AlterEgo flow as a multi-turn conversation:

1. **Welcome** — greet the user, explain what AlterEgo does
2. **Intake** — seven short questions, one per turn (name, age, occupation, work hours, top goal, top fear, years ahead)
3. **Simulation** — POST `/simulate` to the backend, narrate each phase as the NDJSON stream arrives:
   - "Drafting the people in your life — 8 of them."
   - "Planning the years ahead — 10 events outlined."
   - One message per checkpoint (year, title, event, did, consequence)
   - "Stitching it together — the alternate path, the voice…"
4. **Future-self interview** — free-form Q&A. Each user message is forwarded to `/chat` with the full simulation as grounding; the reply streams back from Claude.

State is stored per-sender in `ctx.storage`, so the conversation survives agent restarts.

A `restart` (also `reset`, `start over`) command works in any stage to wipe state and begin again.

## Architecture

```
ASI:One judge
    │
    │  Chat Protocol (mailbox)
    ▼
[uAgent: alterego_agent.py]
    │
    │  HTTP — localhost:8000
    ▼
[FastAPI backend]
    │
    ├─► Anthropic API (counting, plan, detail, finalize, alternate, chat)
    └─► curated event pool, state model, intervention rewrites
```

## Run locally

**Requires Python 3.10+** (`uagents-core`'s Chat Protocol module requires it). On macOS with Homebrew or python.org install, use `python3.13`. `python3` aliased to 3.9 will not work.

Backend must be running first (the agent calls `localhost:8000`).

```bash
# 1. Install
cp .env.example .env
# Edit .env: AGENT_SEED (any random string), AGENTVERSE_API_KEY

python3.13 -m venv .venv      # or python3.10/3.11/3.12 — anything ≥ 3.10
source .venv/bin/activate
pip install -r requirements.txt

# 2. Start the agent
python alterego_agent.py
```

On startup the agent prints two things to the terminal:

```
INFO: [alterego]: Starting agent with address: agent1q...
INFO: [alterego]: Agent inspector available at https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8001&address=agent1q...
INFO: [alterego]: Manifest published successfully: AgentChatProtocol
```

**Open the Agent Inspector URL once**, click **Connect → Mailbox**, and follow the wizard. After that the agent is fully registered and appears in Agentverse. The `AgentChatProtocol` manifest is what makes it ASI:One-compatible.

## Register on Agentverse

After the mailbox is live:

1. Go to https://agentverse.ai/agents
2. Click **Connect Agent**
3. Choose **Chat Protocol**
4. Provide a name, description, and the agent's address (printed at startup)
5. Add keywords: `future simulation`, `personal future`, `wellbeing`, `multi-agent`, `narrative`
6. Click **Evaluate Registration**
7. Once green, your agent appears in the Marketplace and is queryable via ASI:One

## Test it via ASI:One

1. Open https://asi1.ai/
2. Search for your agent by name or address
3. Click **Chat with Agent**
4. Type "hi" → you'll get the welcome
5. Answer the seven questions
6. Watch the simulation narrate
7. Talk to your future self

## Submission deliverables (for the Fetch.ai prize)

The Innovation Lab requires these in your Devpost submission:

- **ASI:One Chat session URL** — the shareable link from a chat session with this agent
- **Agent URL on Agentverse** — `https://agentverse.ai/agents/<agent-address>`
- **Public GitHub repo** — this repo
- **3–5 minute demo video** — show the full flow end-to-end
- **README.md** — must include agent name + agent address + Innovation Lab badge

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_SEED` | `alterego-agent-seed-CHANGE-ME` | Stable seed → stable agent address. **Change this** before registering. |
| `AGENT_PORT` | `8001` | Local port the agent listens on (mailbox mode doesn't need it public, but it must be free). |
| `BACKEND_URL` | `http://localhost:8000` | Where the FastAPI backend is reachable. |
| `PRESENT_YEAR` | `2026` | Anchor year for `yearsAhead → targetYear` math. |
| `AGENTVERSE_API_KEY` | (empty) | Used by the standard registration script. |
