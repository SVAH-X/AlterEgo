# Processing Screen — Story Scroll Redesign

**Date:** 2026-04-25
**Branch:** `feature/processing-story-scroll`
**Worktree:** `.worktrees/processing-story-scroll`
**Scope:** `frontend/src/screens/screens-a.tsx` — `ScreenProcessing` (section 4 of the app)

## Problem

The processing screen feels rushed and the right-hand "story" column reads as subtle metadata, not as the main narrative. Two failure modes:

1. **Events overwrite each other mid-reveal.** When `/simulate` streams checkpoint events faster than the panel can render its bubbles (~2.4s for four bubbles at 600ms intervals), the active event is replaced by the next one before the user has time to read it. Text appears and vanishes.
2. **No transition between events.** A new `filledAt` swaps the active event instantly. There's no fade, no breath, no "the moment landed."
3. **Right column is visually outweighed by the left.** The constellation is glowing, animated, and central; the right column uses subdued text colors (`--ink-1`, `--ink-2`), 16px serif, and reads as a sidebar — but it carries the actual story.

## Goal

Make the processing phase read like a story being written in real time. The narrative is what the user pays attention to; the constellation becomes ambient context that supports it. Pacing is controlled, not LLM-bound.

## Non-goals

- No backend changes. The streaming pipeline (`/simulate` NDJSON phases) stays as-is.
- No layout changes outside the processing screen.
- Constellation visualization is preserved — not removed, not redesigned.
- Phase 1 (counting), phase 2 (plan), phase 4 (finalizing) layouts are unchanged. Only phase 3 (events) gets the scroll treatment and the typography pass applies to all four phases' right column.

## Approach: Story Scroll

The right column becomes a vertical stream of completed checkpoints. New events flow in from the bottom; older events stay above at reduced opacity. Each event gets a guaranteed minimum dwell before the next can begin its reveal.

### Component breakdown

The current right-column body is a phase-conditional `if/else` block. We split phase 3 into a dedicated `StoryScroll` component with three responsibilities, each independently understandable and testable:

1. **`useStoryQueue(outline)`** — hook that watches `outline` for newly-filled checkpoints, enqueues them, and dispenses them with a min-dwell. Returns `{ visible: ScrollEntry[], current: ScrollEntry | null }`. `visible` is every entry that has begun revealing; `current` is the latest.
2. **`<ScrollEntry>`** — renders one checkpoint as a story beat: year/age stamp, title, then bubbles staggered in. Owns its own animation timing relative to its `revealStartedAt`.
3. **`<StoryScroll>`** — composes the hook and renders entries in a scrolling column with the latest at the bottom and auto-scroll into view.

### Queue & dwell logic

```
MIN_DWELL_MS = 4500   // an event holds the floor for at least 4.5s
BUBBLE_STAGGER_MS = 700   // (was 600 — slowed slightly to match new pacing)
```

- `useStoryQueue` keeps a ref'd queue of checkpoints that have arrived from `outline` but haven't started revealing yet.
- A checkpoint starts revealing when (a) it's first-in-queue, and (b) `now - lastRevealStartedAt >= MIN_DWELL_MS`.
- Multiple events arriving in a burst all land in the queue; they're paced out one at a time. The constellation graph still pulses immediately on each `filledAt` (it's the "events arriving" indicator), but the text scroll dispenses on its own clock.
- When the backend finishes (`simStreamPhase === "complete"` or `"finalizing"`) and the queue still has entries, we *flush* — set `MIN_DWELL_MS` to a shorter value (e.g. 1500ms) so the user sees them all before the screen advances.

### Scroll layout

Right column at phase 3:

```
┌────────────────────────────────┐
│ writing checkpoint 04 / 06     │  ← phase header (existing)
├────────────────────────────────┤
│                                │
│  2031 · age 27                 │  ← faded entry (op 0.35)
│  The job offer in Boston       │
│                                │
│  2034 · age 30                 │  ← faded entry (op 0.55)
│  A long Sunday with your sister│
│                                │
│  2037 · AGE 33                 │  ← active entry (op 1.0)
│  The promotion you didn't take │
│  "Rachel: 'You sure?'"         │
│  You sat with it three nights. │
│  Something quieter took root.  │
│                                │
└────────────────────────────────┘  ← latest is anchored to the bottom
```

- Scroll is **bottom-anchored**: the active (newest) entry sits near the bottom of the column. Older entries push upward as new ones arrive. Overflow off the top is hidden with a top-edge fade mask (linear gradient from transparent to background).
- Older entries fade by recency, not by index: opacity = `0.35 + 0.65 * (recency)` where `recency` is `1.0` for the active entry and decays per entry above. Concretely: active=1.0, prev=0.55, prev-1=0.35, prev-2..=0.25 (clamped).
- Older entries also collapse: only year/age stamp + title remain. Bubbles only render for the active entry. This keeps the column readable and prevents the panel from visually overflowing.
- Inside the active entry, bubbles still stagger in at `BUBBLE_STAGGER_MS` intervals using the same `now - revealStartedAt` math.

### Transitions

- New active entry: fades in over 600ms while shifting up ~14px from below (translateY).
- Previous active demotes to "older" state: bubbles collapse out (200ms fade + height collapse), color shifts from `--ink` to `--ink-2`, opacity drops.
- These run in parallel — the demotion of the old and the arrival of the new feel like a single page-turn, not two events.

### Typography hierarchy upgrade

Applies to the right column across all phases. Goal: the story column should feel like the primary reading surface, not a sidebar.

| Element                         | Before                              | After                                                       |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| Phase header (`storyHeader`)    | `<Meta>` (mono, `--ink-3`)          | unchanged — it's the small label                            |
| Active entry: year/age stamp    | mono 10px, `--accent`               | mono 11px, `--accent`, +12% letter-spacing                  |
| Active entry: title             | serif 19px italic, `--ink`          | serif 22px italic, `--ink`, line-height 1.3                 |
| Active entry: speaker label     | mono 9px, `--accent` or `--ink-3`   | mono 10px, `--accent` or `--ink-2`                          |
| Active entry: quote bubble      | serif 16px, `--ink`                 | serif 18px, `--ink`, line-height 1.5                        |
| Active entry: narrator bubble   | serif 16px italic, `--ink-2`        | serif 17px italic, `--ink-1`, line-height 1.55              |
| Faded entry: title              | (n/a)                               | serif 16px italic, color modulated by recency               |
| Phase 1 agent name              | serif 19px italic, `--ink`          | serif 21px italic, `--ink`                                  |
| Phase 1 relationship line       | serif 14px italic, `--ink-2`        | serif 16px italic, `--ink-1`                                |
| Phase 2 hint                    | serif 16px italic, `--ink-1`        | serif 17px italic, `--ink-1`, line-height 1.45              |
| Right column width              | 360px                               | 420px                                                       |

Width bump (360 → 420) gives prose more room to breathe and signals the column's increased importance. The grid template becomes `minmax(0, 1fr) 420px`.

### Constellation behavior during the scroll

- **Constellation `activeIdx` is driven by the paced view, not raw `outline`.** When the text says "you sat with it three nights," the graph highlights the actors involved in *that* event, not the next one already buffered. The hook exposes `currentOutlineIdx` for the SVG to consume in place of the existing `activeIdx` derivation.
- Outline-arrival animation (the small "+ event" pulse on the year axis) still fires on raw `filledAt` — that's a "stream is alive" cue and we want it immediate.
- During phase 3, the constellation's overall opacity drops slightly (e.g. 0.85) so the text reads as foreground. One-time CSS opacity transition when entering phase 3, no per-frame work.
- The center node still labels with the user's name, unchanged.

### Auto-advance timing

The existing `useEffect` at `screens-a.tsx:755` advances the screen 1.2–5s after `simStreamPhase === "complete"`. With the queue, we need to also wait for the queue to drain. New rule:

```
advance_at = max(
  mountedAt + 5000,
  lastRevealStartedAt + MIN_DWELL_MS + 1200
)
```

So if the backend finishes early but the queue still has entries pacing out, we hold until the last one has had its dwell + a 1.2s settling beat.

## Data flow

```
/simulate stream → App.runSimulate → setOutline (existing)
                                   ↓
                          ScreenProcessing reads `outline` prop (existing)
                                   ↓
                          useStoryQueue(outline) — NEW
                                   ↓                      ↓
                          paced ScrollEntry list    constellation pulses
                                                    (uses raw outline,
                                                     unchanged)
```

`outline` is the source of truth. The hook derives a *paced view* of it for the text column. The graph keeps consuming `outline` directly so visual feedback to the SVG is immediate.

## Error handling

- The error branch (`isError`) is unchanged — it shows the existing error panel, no scroll, no queue.
- If the queue has unrendered entries when an error arrives, we flush them at the accelerated rate and then show the error banner above the scroll.

## Testing

- **Manual / browser:** `npm run dev`, run a simulation end-to-end, watch phase 3.
  - Verify: each event holds the floor for ~4.5s, no event is overwritten mid-reveal.
  - Verify: older events remain visible above, faded.
  - Verify: text on the right reads as the focal element, not a sidebar.
  - Verify: when backend finishes fast, queue still drains gracefully before screen auto-advances.
- **Typecheck:** `npm run typecheck` must pass clean.
- **No new unit tests** — the project does not currently have a frontend test harness; adding one is out of scope.

## Files changed

- `frontend/src/screens/screens-a.tsx` — extract phase-3 right-column into `StoryScroll`, `ScrollEntry`, add `useStoryQueue` hook, update typography in phase-1/2/4 right-column blocks, bump grid column width, tweak auto-advance effect, drop constellation opacity at phase 3.

That's it — single file. The file is already large (~1500 lines); we'll add ~150 lines net and may extract the new pieces to a sibling file `frontend/src/screens/processing-story.tsx` if it keeps the parent file from growing past comprehensibility. Decision deferred to implementation: if the new code lands cleanly under 100 lines, keep inline; if larger, split.

## Open questions

None blocking. The implementation plan will resolve the inline-vs-split decision based on the actual size of the diff.

## Out of scope

- Reordering phases or changing the streaming protocol.
- Changing the constellation graph layout or node behavior.
- Adding sound, voice narration, or other modalities to phase 3.
- Persisting the scroll for re-watching.
