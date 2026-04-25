# AlterEgo backend

FastAPI service. Owns simulation orchestration, the tiered LLM router, OASIS integration, and the future-self interview.

## Quick start

```bash
uv sync                                              # install deps
uv run uvicorn app.main:app --reload --port 8000     # dev server
```

Visit `http://localhost:8000/docs` for the OpenAPI UI.

## Layout

- `app/main.py` — FastAPI app entry, CORS, router includes
- `app/config.py` — env-driven settings
- `app/api/` — REST routers (intake, simulation, checkpoints, interview, health)
- `app/models/` — Pydantic schemas (the contract; lock these early)
- `app/services/` — business logic (reality seed, agent graph, scheduler, OASIS rounds, causal extractor, voice)
- `app/routing/` — tiered LLM router (Plan B hosted APIs default; Plan A local for GX10)
- `app/db/` — MongoDB Atlas via motor
- `app/prompts/` — character cards and structured prompt templates

## Inference plans

The `AgentRouter` is backend-agnostic. Set `INFERENCE_PLAN=B` (default) or `INFERENCE_PLAN=A` in `.env` to swap.

- **Plan B (default):** Anthropic Opus 4.7 / Sonnet 4.6 / Haiku 4.5 + Groq llama-3.1-8b
- **Plan A (GX10 only):** vLLM/Ollama-served local open-weights at `GX10_BASE_URL`
