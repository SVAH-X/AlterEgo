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

The backend is stateless and exposes three real endpoints behind a health check:

- `POST /simulate` — body `Profile`, response `SimulationData` (one Claude call generates both paths + opening voice line + canned replies)
- `POST /chat` — body `{ profile, history, user_text }`, response `{ text }` (free-form future-self reply)
- `POST /chat/voice` — same body as `/chat`, response `audio/mpeg` bytes (ElevenLabs streaming TTS)

The `SimulationData` and `Profile` Pydantic models in `backend/app/models/` mirror `src/types.ts` exactly so the JSON crosses the wire untransformed. Wire it in by replacing the hardcoded `AE_DATA` import in `src/App.tsx` with a fetch to `/simulate` after intake completes — keep `AE_DATA` as a fallback for the scripted demo.
