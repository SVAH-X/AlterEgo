# AlterEgo Fetch.ai uAgent (optional)

A thin (~100 LOC) uAgent that bridges the AlterEgo FastAPI backend to ASI:One Chat Protocol. Runs in mailbox mode — no public endpoint required.

## When to run this

Only if pursuing the Fetch.ai Agentverse track. Otherwise skip; the main app does not depend on this.

## Run

```bash
cp .env.example .env
# Fill ANTHROPIC keys, AGENT_SEED, AGENTVERSE_API_KEY, BACKEND_URL
uv sync
uv run python alterego_agent.py
```

The agent prints an Agent Inspector URL on startup. Open it, click "Connect" → "Mailbox", then register on Agentverse via the standard registration script.

## Architecture

```
ASI:One judge
   │
   ▼  Chat Protocol (mailbox)
[uAgent: alterego_agent.py]
   │
   ▼  HTTP (localhost:8000)
[FastAPI backend]
   │
   ▼
camel-oasis simulation
```

Chat messages from ASI:One arrive as `ChatMessage` events. The agent forwards them to `POST /simulation/start` (or whatever endpoint matches the conversation state) and returns the response as another `ChatMessage`. Optionally include a deep-link to the full app for richer interaction.
