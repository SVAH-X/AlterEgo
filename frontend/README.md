# Frontend

Vite + React + TypeScript implementation of the AlterEgo design.

## Stack

- Vite 5
- React 18 + TypeScript (strict)
- No CSS framework — design tokens live in `src/styles.css`
- Fonts: Cormorant Garamond (serif/literary), Inter (UI), JetBrains Mono (meta) via Google Fonts
- React Three Fiber will be added when the avatar work moves from photographic placeholder to 3D

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run typecheck
```

## Screens

The current build is the eight-screen prototype flow from the design:

1. `landing` — cold open
2. `intake` — guided 7-question form
3. `processing` — evolving line + breathing rings
4. `reveal` — portrait fade → name → streamed opening line
5. `chat` — portrait left, conversation right, suggestion chips
6. `timeline` — drag scrubber 2026 → 2046, checkpoints reveal as you cross them
7. `slider` — change one variable (work hours), trajectory rewrites live
8. `encore` — two futures side by side

Use `←` / `→` to jump between screens, or hover the dot in the bottom-right for the dev nav.

## Design tokens (`src/styles.css`)

- Palette: deep charcoal (`--bg`), warm off-white type (`--ink`), dim amber accent (`--accent`)
- Type: `--serif` / `--sans` / `--mono`
- Motion: `--ease` ~ `cubic-bezier(0.22, 0.61, 0.36, 1)`, transitions 400–700ms
- Subtle film grain overlay via `.grain::before`

## Where the design code came from

The HTML/CSS/JS prototype lives in the design handoff bundle. The CSS was ported verbatim; the JSX prototypes were converted to typed React components in `src/screens/`.

## API contract (backend)

The backend exposes:

- `POST /intake` → `{ session_id }`
- `POST /simulation/start` → `CheckpointCard`
- `POST /simulation/resume` → `CheckpointCard`
- `POST /simulation/branch` → `CheckpointCard`
- `GET  /checkpoints/{id}` → `Checkpoint`
- `GET  /checkpoints/session/{session_id}` → `Checkpoint[]`
- `POST /interview` → `InterviewTurn { text, audio_url }`

Pydantic schemas in `backend/app/models/` are the source of truth — mirror them in `src/types.ts` when wiring up real data. Right now `src/data.ts` carries the sample profile and trajectory used by the prototype.
