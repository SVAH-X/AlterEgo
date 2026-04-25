# oasis_ext — AlterEgo's customizations on top of camel-oasis

We use `pip install camel-oasis` for the substrate and layer five customizations on top, separately from the upstream package. This module is the home for those customizations.

## The five modifications

1. **Personalized agent instantiation** ([personalized_agents.py](personalized_agents.py))
   Build a profile-driven graph (manager, colleagues, friend, family, industry voices) instead of generic populations. Character cards are generated from intake.

2. **Real-news ingestion** ([news_ingest.py](news_ingest.py))
   GDELT + curated feeds → posts injected onto the OASIS social platform. The world is no longer a sandbox.

3. **Tiered model routing per agent** ([tiered_routing.py](tiered_routing.py))
   Different OASIS agents get different LLM tiers via the AlterEgo `AgentRouter`. Future-self uses the strongest model; noise accounts use the smallest.

4. **Checkpoint orchestration** ([checkpoint_orchestrator.py](checkpoint_orchestrator.py))
   Restructure OASIS from continuous-report mode into checkpoint-based: discrete-event scheduling, pause / inspect / edit / resume.

5. **Causal-hypothesis extractor** ([causal_logger.py](causal_logger.py))
   Read interaction logs, produce a structured causal-hypothesis ledger.

## Importing

```python
from oasis_ext.checkpoint_orchestrator import run_round
from oasis_ext.personalized_agents import build_population
```

The backend `app/services/oasis_round.py` calls into this module; do not import directly from the user-facing `app/` layer.
