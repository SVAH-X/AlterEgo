# Frontend

Tooling not yet selected. Decide before scaffolding.

## Likely shape (subject to change)

- Next.js 15 App Router (or Vite + React)
- React Three Fiber + Three.js + drei (avatar scene)
- Tailwind + a primitives library (shadcn/ui or similar)
- TypeScript

## Pages

- `/` — landing
- `/intake` — guided form (5–10 minutes)
- `/simulate` — avatar + timeline scrubber + checkpoint cards + social feed
- `/interview` — voice + text future-self chat

## API contract

The backend exposes:
- `POST /intake` → `{ session_id }`
- `POST /simulation/start` → `CheckpointCard`
- `POST /simulation/resume` → `CheckpointCard`
- `POST /simulation/branch` → `CheckpointCard`
- `GET  /checkpoints/{id}` → `Checkpoint`
- `GET  /checkpoints/session/{session_id}` → `Checkpoint[]`
- `POST /interview` → `InterviewTurn { text, audio_url }`

Pydantic schemas in `backend/app/models/` are the source of truth — mirror them in TypeScript when frontend tooling is picked.
