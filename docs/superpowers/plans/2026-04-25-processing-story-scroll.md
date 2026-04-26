# Processing Story-Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LLM-paced bubble panel on the processing screen with a user-paced "story scroll" right column, plus a persistent advance-dock affordance that signals user control.

**Architecture:** Extract the queue logic and dock UI into a new sibling file `frontend/src/screens/processing-story.tsx`. Wire the new components into the existing `ScreenProcessing` in `screens-a.tsx`, replacing only the phase-3 right-column body and the auto-advance `useEffect`. Constellation SVG remains; its `activeIdx` is driven by the paced view of the outline so the highlighted node always matches the visible text. All animations key off `now` from the existing rAF tick already running in `ScreenProcessing`, passed through props.

**Tech Stack:** React 18 + TypeScript, Vite. No new deps. The project has no frontend test harness — verification is `npm run typecheck`, `npm run build`, and manual browser testing.

**Spec:** `docs/superpowers/specs/2026-04-25-processing-story-scroll-design.md`

---

## File Structure

| File | Status | Purpose |
| --- | --- | --- |
| `frontend/src/screens/processing-story.tsx` | **create** | `useStoryQueue` hook, `ScrollEntry`, `StoryScroll`, `AdvanceDock`, types & constants for the story-scroll UX |
| `frontend/src/screens/screens-a.tsx` | **modify** | Wire new components into `ScreenProcessing`; remove auto-advance; add screen-local key handler; bump grid column width 360→420; lower constellation opacity at phase 3; route `activeIdx` through paced view; phase-1/2/4 typography upgrades |

`frontend/src/App.tsx` is **not** modified — the screen-local key handler will `stopPropagation`/`preventDefault` consumed keys so the App-level handler stays as a fallback.

---

## Task 1: New file scaffold + types & constants

**Files:**
- Create: `frontend/src/screens/processing-story.tsx`

- [ ] **Step 1: Create the file with types, constants, and a placeholder export**

```tsx
// frontend/src/screens/processing-story.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AgentSpec, Checkpoint } from "../types";
import type { FilledOutline } from "../App";

// ----- timing -----
export const BUBBLE_STAGGER_MS = 700;
export const READY_HINT_DELAY_MS = 600;
export const INACTIVITY_TIMEOUT_MS = 30_000;
export const ENTRY_FADE_MS = 600;

// ----- types -----
export interface Bubble {
  who: string; // "narrator" | agent name
  line: string;
}

export interface ScrollEntry {
  outlineIdx: number;
  checkpoint: Checkpoint;
  primary_actors: string[];
  bubbles: Bubble[];
  revealStartedAt: number;
}

export type DockState =
  | "streaming"   // first event auto-revealing, or new event mid-reveal
  | "revealing"   // bubbles still appearing
  | "ready"       // last bubble in, awaiting user advance
  | "waiting"     // queue empty; backend hasn't produced next event yet
  | "final";      // last event done AND backend complete; advance leaves the screen

// Placeholder until later tasks add the real components.
export const _moduleReady = true;
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (clean).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/processing-story.tsx
git commit -m "scaffold: processing-story module (types + timing constants)"
```

---

## Task 2: `useStoryQueue` hook

**Files:**
- Modify: `frontend/src/screens/processing-story.tsx`

- [ ] **Step 1: Replace the placeholder export with the hook**

Replace `export const _moduleReady = true;` with:

```tsx
// makeBubbles is currently a private helper inside screens-a.tsx. We re-implement
// it here (the logic is identical) so processing-story.tsx is self-contained.
function makeBubbles(
  cp: Checkpoint,
  agents: AgentSpec[],
  actors: string[],
): Bubble[] {
  const cast = new Map(agents.map((a) => [a.agent_id, a]));
  const actorNames = actors
    .map((id) => cast.get(id)?.name)
    .filter((n): n is string => Boolean(n) && n !== "You");

  const bubbles: Bubble[] = [];
  const m = /"([^"]+)"/.exec(cp.event);
  if (m) {
    const speaker =
      actorNames.find((n) => cp.event.includes(n)) ?? actorNames[0] ?? "—";
    bubbles.push({ who: speaker, line: m[1] });
    const lead = cp.event.replace(/"[^"]+"/g, "").replace(/\s+/g, " ").trim();
    if (lead && lead.length > 6) bubbles.push({ who: "narrator", line: lead });
  } else {
    bubbles.push({ who: "narrator", line: cp.event });
  }
  if (cp.did) bubbles.push({ who: "narrator", line: cp.did });
  if (cp.consequence) bubbles.push({ who: "narrator", line: cp.consequence });
  return bubbles.slice(0, 4);
}

export interface UseStoryQueueArgs {
  outline: FilledOutline[];
  agents: AgentSpec[];
  now: number;
  /** Caller-provided clock used by the inactivity timeout logic. */
  active: boolean;
}

export interface UseStoryQueueResult {
  /** Entries that have started revealing, oldest-first. */
  visible: ScrollEntry[];
  /** The latest entry that's revealing, or null if nothing is showing yet. */
  current: ScrollEntry | null;
  /** Outline index of `current`, or -1. Used by the constellation to pulse the right node. */
  currentOutlineIdx: number;
  /** True when there are queued entries waiting for user advance. */
  hasNext: boolean;
  /** True when the queue is drained AND no more outline entries exist OR are unfilled. */
  drained: boolean;
  /** Dock state derived from queue + reveal progress. */
  dockState: DockState;
  /** Advance: dispense the next queued entry. No-op if nothing queued. */
  advance: () => void;
  /** Last user-input time (ms). Updated when advance() fires. */
  lastInputAt: number;
}

/**
 * useStoryQueue
 * - Watches `outline` for newly-filled checkpoints and enqueues them in order.
 * - Dispenses them one at a time when the caller invokes `advance()` (user input)
 *   or when the inactivity timeout fires.
 * - First entry auto-dispenses without waiting for input.
 */
export function useStoryQueue({
  outline,
  agents,
  now,
  active,
}: UseStoryQueueArgs): UseStoryQueueResult {
  const [visible, setVisible] = useState<ScrollEntry[]>([]);
  const queueRef = useRef<ScrollEntry[]>([]);
  const seenRef = useRef<Set<number>>(new Set());
  const [lastInputAt, setLastInputAt] = useState<number>(now);
  const autoStartedRef = useRef(false);

  // Convert newly-filled outline entries into queued ScrollEntries.
  useEffect(() => {
    outline.forEach((o, idx) => {
      if (!o.filled || !o.checkpoint) return;
      if (seenRef.current.has(idx)) return;
      seenRef.current.add(idx);
      const entry: ScrollEntry = {
        outlineIdx: idx,
        checkpoint: o.checkpoint,
        primary_actors: o.primary_actors,
        bubbles: makeBubbles(o.checkpoint, agents, o.primary_actors),
        revealStartedAt: 0, // set when dispensed
      };
      queueRef.current.push(entry);
    });
    // Trigger a re-render so the dock can update hasNext.
    setVisible((v) => v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline, agents]);

  const dispense = useMemo(
    () => () => {
      const next = queueRef.current.shift();
      if (!next) return;
      next.revealStartedAt = performance.now();
      setVisible((v) => [...v, next]);
    },
    [],
  );

  const advance = useMemo(
    () => () => {
      setLastInputAt(performance.now());
      dispense();
    },
    [dispense],
  );

  // Auto-start the first event so the screen doesn't open on a static prompt.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!active) return;
    if (queueRef.current.length === 0) return;
    autoStartedRef.current = true;
    dispense();
  }, [outline, active, dispense]);

  // Inactivity timeout. Only fires when (a) we have a queued entry to dispense,
  // and (b) the current entry has finished its bubble reveal at least
  // INACTIVITY_TIMEOUT_MS ago, and (c) no input since.
  const current = visible[visible.length - 1] ?? null;
  const currentBubbleCount = current?.bubbles.length ?? 0;
  const currentRevealEndsAt =
    current !== null
      ? current.revealStartedAt +
        currentBubbleCount * BUBBLE_STAGGER_MS +
        READY_HINT_DELAY_MS
      : 0;
  const idleSince = Math.max(currentRevealEndsAt, lastInputAt);
  useEffect(() => {
    if (queueRef.current.length === 0) return;
    if (now - idleSince < INACTIVITY_TIMEOUT_MS) return;
    dispense();
  }, [now, idleSince, dispense]);

  const hasNext = queueRef.current.length > 0;
  const drained =
    !hasNext &&
    outline.length > 0 &&
    outline.every((o) => o.filled);

  // Dock state derivation.
  let dockState: DockState;
  if (current === null) {
    dockState = "streaming";
  } else {
    const bubblesDoneAt =
      current.revealStartedAt + currentBubbleCount * BUBBLE_STAGGER_MS;
    const readyAt = bubblesDoneAt + READY_HINT_DELAY_MS;
    if (now < readyAt) {
      dockState = "revealing";
    } else if (hasNext) {
      dockState = "ready";
    } else if (!drained) {
      dockState = "waiting";
    } else {
      dockState = "final";
    }
  }

  return {
    visible,
    current,
    currentOutlineIdx: current?.outlineIdx ?? -1,
    hasNext,
    drained,
    dockState,
    advance,
    lastInputAt,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/processing-story.tsx
git commit -m "feat: useStoryQueue hook with manual-advance + inactivity timeout"
```

---

## Task 3: `AdvanceDock` component

**Files:**
- Modify: `frontend/src/screens/processing-story.tsx`

- [ ] **Step 1: Append the component to the file**

Add to the bottom of `processing-story.tsx`:

```tsx
export interface AdvanceDockProps {
  state: DockState;
  /** What the dock prompt should read. Defaults derived from state if omitted. */
  label?: string;
  /** Click handler. Should call advance() (or screen-advance for "final"). */
  onAdvance: () => void;
  /** Tick clock — the underline pulse animates against this. */
  now: number;
  style?: CSSProperties;
}

const DOCK_LABELS: Record<DockState, string> = {
  streaming: "streaming",
  revealing: "revealing",
  ready: "press space  ·  next →",
  waiting: "· · ·",
  final: "press space  ·  meet yourself →",
};

const DOCK_INTERACTIVE: Record<DockState, boolean> = {
  streaming: false,
  revealing: false,
  ready: true,
  waiting: false,
  final: true,
};

export function AdvanceDock({
  state,
  label,
  onAdvance,
  now,
  style,
}: AdvanceDockProps) {
  const interactive = DOCK_INTERACTIVE[state];
  const text = label ?? DOCK_LABELS[state];

  // Underline pulse: opacity 0.3 → 1.0 → 0.3 over 1.6s when interactive,
  // static 0.4 otherwise. Computed off `now` so it shares the screen's rAF tick.
  const pulse = interactive
    ? 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((now / 1600) * Math.PI * 2))
    : 0.4;

  const color =
    state === "ready" || state === "final" ? "var(--ink-2)" : "var(--ink-3)";
  const underlineColor =
    state === "ready" || state === "final"
      ? "var(--accent)"
      : "var(--ink-4, var(--line))";

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={interactive ? "advance" : undefined}
      onClick={interactive ? onAdvance : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAdvance();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 18,
        paddingBottom: 4,
        userSelect: "none",
        cursor: interactive ? "pointer" : "default",
        ...style,
      }}
    >
      <div
        style={{
          width: 24,
          height: 1,
          background: underlineColor,
          opacity: pulse,
          transition: "background 600ms var(--ease)",
        }}
      />
      <div
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "lowercase",
          color,
          transition: "color 400ms var(--ease)",
        }}
      >
        {text}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/processing-story.tsx
git commit -m "feat: AdvanceDock — persistent state-aware advance affordance"
```

---

## Task 4: `ScrollEntry` and `StoryScroll` components

**Files:**
- Modify: `frontend/src/screens/processing-story.tsx`

- [ ] **Step 1: Append the two components to the file**

```tsx
export interface ScrollEntryProps {
  entry: ScrollEntry;
  /** Recency rank: 0 for the active entry, 1 for the one above, etc. */
  rank: number;
  age: number | null;
  now: number;
}

const RECENCY_OPACITY = [1.0, 0.55, 0.35, 0.25];

export function ScrollEntryView({ entry, rank, age, now }: ScrollEntryProps) {
  const isActive = rank === 0;
  const opacity =
    RECENCY_OPACITY[Math.min(rank, RECENCY_OPACITY.length - 1)];

  // Only the active entry reveals bubbles; older entries collapse to title.
  const visibleBubbles = isActive
    ? entry.bubbles.filter(
        (_, i) => now - entry.revealStartedAt >= i * BUBBLE_STAGGER_MS,
      )
    : [];

  const sinceMount = now - entry.revealStartedAt;
  const enterAlpha = Math.max(0, Math.min(1, sinceMount / ENTRY_FADE_MS));
  const enterShift = (1 - enterAlpha) * 14; // px translateY from below

  return (
    <div
      style={{
        opacity: opacity * (isActive ? enterAlpha : 1),
        transform: isActive ? `translateY(${enterShift}px)` : undefined,
        transition: isActive
          ? undefined
          : "opacity 600ms var(--ease)",
        display: "flex",
        flexDirection: "column",
        gap: isActive ? 14 : 4,
        paddingBottom: isActive ? 0 : 6,
      }}
    >
      <div>
        <div
          className="mono"
          style={{
            fontSize: isActive ? 11 : 10,
            letterSpacing: "0.22em",
            color: isActive ? "var(--accent)" : "var(--ink-3)",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {entry.checkpoint.year}
          {age !== null ? ` · age ${age}` : ""}
        </div>
        <div
          className="serif"
          style={{
            fontSize: isActive ? 22 : 16,
            fontStyle: "italic",
            lineHeight: 1.3,
            color: isActive ? "var(--ink)" : "var(--ink-1)",
          }}
        >
          {entry.checkpoint.title || entry.bubbles[0]?.line}
        </div>
      </div>

      {visibleBubbles.map((b, j) => (
        <div
          key={`${entry.outlineIdx}-${j}`}
          style={{ animation: "fade-in 600ms var(--ease) both" }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: b.who === "narrator" ? "var(--ink-2)" : "var(--accent)",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {b.who === "narrator" ? "—" : b.who}
          </div>
          <div
            className="serif"
            style={{
              fontSize: b.who === "narrator" ? 17 : 18,
              lineHeight: b.who === "narrator" ? 1.55 : 1.5,
              color: b.who === "narrator" ? "var(--ink-1)" : "var(--ink)",
              fontStyle: b.who === "narrator" ? "italic" : "normal",
              letterSpacing: "0.003em",
            }}
          >
            {b.who === "narrator" ? b.line : `“${b.line}”`}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface StoryScrollProps {
  visible: ScrollEntry[];
  now: number;
}

/**
 * StoryScroll
 * Bottom-anchored: latest entry sits at the bottom; older entries push up.
 * Top edge is masked so older overflow fades into the background.
 */
export function StoryScroll({ visible, now }: StoryScrollProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active entry into view at the bottom.
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [visible.length]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        paddingTop: 28,
        paddingBottom: 4,
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0, #000 56px, #000 100%)",
        maskImage:
          "linear-gradient(to bottom, transparent 0, #000 56px, #000 100%)",
        scrollbarWidth: "none",
      }}
    >
      {visible.map((entry, i) => (
        <ScrollEntryView
          key={entry.outlineIdx}
          entry={entry}
          rank={visible.length - 1 - i}
          age={entry.checkpoint.age}
          now={now}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/processing-story.tsx
git commit -m "feat: StoryScroll + ScrollEntryView — accumulating story column"
```

---

## Task 5: Wire into `ScreenProcessing` — phase 3 right column + dock + keyboard

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx` (lines around 700–1390 — the `ScreenProcessing` component)

- [ ] **Step 1: Add imports at the top of `screens-a.tsx`**

Locate the existing import block at the top of `screens-a.tsx` and add:

```tsx
import {
  AdvanceDock,
  StoryScroll,
  useStoryQueue,
  type DockState,
} from "./processing-story";
```

- [ ] **Step 2: Inside `ScreenProcessing`, call the queue hook**

After the existing `now`/`agentArrivedAt`/`outline`/`activeIdx` derivations (around line 794, right after `const active = activeIdx >= 0 ? outline[activeIdx] : null;`), add:

```tsx
  // The story queue paces text reveal independently of the SVG's pulses.
  const queue = useStoryQueue({
    outline,
    agents,
    now,
    active: simStreamPhase !== "idle" && simStreamPhase !== "error",
  });
  // Active for the constellation: paced view, not raw outline.
  const pacedActiveIdx = queue.currentOutlineIdx;
```

- [ ] **Step 3: Replace the phase-3 right-column block**

Find the `{!isError && phase === 3 && active && (` block (around line 1259). Replace the entire block — from `{!isError && phase === 3 && active && (` through the matching `)}` — with:

```tsx
          {!isError && phase === 3 && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
              <StoryScroll visible={queue.visible} now={now} />
            </div>
          )}
```

- [ ] **Step 4: Add the AdvanceDock at the bottom of the right column container**

The right column container is the `<div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderLeft: ... }}>` block (around line 1126). It currently ends with the phase-4 conditional. Right *before* the closing `</div>` of this container, add:

```tsx
          <AdvanceDock
            state={dockStateForScreen({ phase, isError, queue, now })}
            now={now}
            onAdvance={handleAdvance}
          />
```

Then add these helpers at the top of `ScreenProcessing` (just under the existing `useEffect`s, around line 760):

```tsx
  // Translate the four-phase pipeline + queue state into a single dock state.
  // Phase 1 holds (state "ready") once all agents have arrived; phase 2 holds
  // once all hints have appeared; phase 3 reads from the queue directly;
  // phase 4 final state shows once finalProgress completes.
  function dockStateForScreen({
    phase,
    isError,
    queue,
    now: _now,
  }: {
    phase: number;
    isError: boolean;
    queue: ReturnType<typeof useStoryQueue>;
    now: number;
  }): DockState {
    if (isError) return "final";
    if (phase === 1) {
      // Ready when all known agents have visibly arrived.
      const arrivedCount = decoratedNodes.length;
      const total = layout.length || 0;
      if (total > 0 && arrivedCount >= total) return "ready";
      return "streaming";
    }
    if (phase === 2) {
      if (planArrivedAt === null) return "streaming";
      const lastRevealAt = planArrivedAt + 600 + (outline.length - 1) * 700;
      return _now >= lastRevealAt ? "ready" : "revealing";
    }
    if (phase === 3) return queue.dockState;
    if (phase === 4) {
      if (simStreamPhase === "complete" && finalProgress >= 1) return "final";
      return "streaming";
    }
    return "streaming";
  }

  // Called from keyboard or dock click. Behavior depends on phase:
  // - phase 1/2: advance to next phase by jumping the SVG forward visually
  //   (the actual phase is server-driven; we just mark this user-acknowledged
  //   so the dock state moves on).
  // - phase 3: dispense next queue entry, OR advance screen if drained + complete.
  // - phase 4: advance screen.
  function handleAdvance() {
    if (isError) {
      onContinue();
      return;
    }
    if (phase === 1 || phase === 2) {
      setUserUnlockedPhase(phase);
      return;
    }
    if (phase === 3) {
      if (queue.drained && (simStreamPhase === "complete" || simStreamPhase === "finalizing")) {
        onContinue();
        return;
      }
      queue.advance();
      return;
    }
    // phase === 4
    if (simStreamPhase === "complete") {
      onContinue();
    }
  }
```

- [ ] **Step 5: Add the `userUnlockedPhase` state**

Near the other `useState` declarations at the top of `ScreenProcessing` (around line 713, after `const [now, setNow] = useState(...)`), add:

```tsx
  const [userUnlockedPhase, setUserUnlockedPhase] = useState<number>(0);
```

This isn't yet wired to gate phases 1→2/2→3 visually — that happens in Task 6.

- [ ] **Step 6: Add the screen-local keydown listener**

Inside `ScreenProcessing`, add a new `useEffect` after the existing rAF tick effect (around line 748):

```tsx
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleAdvance();
      }
    }
    document.addEventListener("keydown", onKey, true); // capture so we win over App.tsx
    return () => document.removeEventListener("keydown", onKey, true);
    // handleAdvance closes over current state via React's normal closure rules;
    // the empty dep list is intentional — the listener reads from refs and
    // current state via the closure of every render. We re-bind on every
    // render to keep the closure fresh.
  });
```

- [ ] **Step 7: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(processing): wire StoryScroll + AdvanceDock + keyboard handler"
```

---

## Task 6: Phase-boundary gating — phase 1/2 hold for user

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

We need the right-column phase-1 and phase-2 panels to *stay rendered* until the user advances, even if the backend has streamed past. Today, the right-column body is conditional on `phase === N`; phase comes from `simStreamPhase` via `PHASE_TO_STEP`. We add a "displayed phase" that is the **min** of the server phase and the user-unlocked phase.

- [ ] **Step 1: Compute `displayedPhase`**

Just below the existing `const phase = PHASE_TO_STEP[simStreamPhase] ?? 1;` line (around line 763), add:

```tsx
  // Server phase (`phase`) always advances with the stream. `displayedPhase` is
  // gated by user advancement: we don't move the right-column UI from phase 1
  // to phase 2 (or 2 → 3) until the user has acknowledged the gate. Phase 4
  // (finalizing) is always allowed to display whenever the server reaches it,
  // because the queue/dock already handles 3 → 4 advancement explicitly.
  const displayedPhase =
    phase >= 4
      ? phase
      : Math.min(phase, Math.max(1, userUnlockedPhase + 1));
```

- [ ] **Step 2: Replace usages of `phase` in the right-column body conditionals only**

Find these conditionals (in the right-column body, around lines 1170–1315):

```tsx
{!isError && phase === 1 && (
{!isError && phase === 2 && (
{!isError && phase === 3 && (
{!isError && phase === 4 && (
```

Change each to use `displayedPhase`:

```tsx
{!isError && displayedPhase === 1 && (
{!isError && displayedPhase === 2 && (
{!isError && displayedPhase === 3 && (
{!isError && displayedPhase === 4 && (
```

**Do NOT change** `phase` references in the SVG / left-column code or the percentage-bar code — those should track the actual server phase.

- [ ] **Step 3: Update `dockStateForScreen` to use `displayedPhase`**

Inside `dockStateForScreen`, replace `phase` references with `displayedPhase`. Update the arg name as well:

```tsx
  function dockStateForScreen({
    displayedPhase,
    isError,
    queue,
    now: _now,
  }: {
    displayedPhase: number;
    isError: boolean;
    queue: ReturnType<typeof useStoryQueue>;
    now: number;
  }): DockState {
    if (isError) return "final";
    if (displayedPhase === 1) {
      const arrivedCount = decoratedNodes.length;
      const total = layout.length || 0;
      if (total > 0 && arrivedCount >= total) return "ready";
      return "streaming";
    }
    if (displayedPhase === 2) {
      if (planArrivedAt === null) return "streaming";
      const lastRevealAt = planArrivedAt + 600 + (outline.length - 1) * 700;
      return _now >= lastRevealAt ? "ready" : "revealing";
    }
    if (displayedPhase === 3) return queue.dockState;
    if (displayedPhase === 4) {
      if (simStreamPhase === "complete" && finalProgress >= 1) return "final";
      return "streaming";
    }
    return "streaming";
  }
```

And update the call site (the `<AdvanceDock state={...} />` line):

```tsx
  state={dockStateForScreen({ displayedPhase, isError, queue, now })}
```

- [ ] **Step 4: Update `handleAdvance` to use `displayedPhase`**

```tsx
  function handleAdvance() {
    if (isError) {
      onContinue();
      return;
    }
    if (displayedPhase === 1 || displayedPhase === 2) {
      setUserUnlockedPhase(displayedPhase);
      return;
    }
    if (displayedPhase === 3) {
      if (queue.drained && (simStreamPhase === "complete" || simStreamPhase === "finalizing")) {
        onContinue();
        return;
      }
      queue.advance();
      return;
    }
    if (simStreamPhase === "complete") {
      onContinue();
    }
  }
```

- [ ] **Step 5: Remove the old auto-advance `useEffect`**

Find the effect at line 755:

```tsx
  useEffect(() => {
    if (simStreamPhase !== "complete") return;
    const elapsed = Date.now() - mountedAtRef.current;
    const wait = Math.max(1200, 5000 - elapsed);
    const t = setTimeout(() => onContinue(), wait);
    return () => clearTimeout(t);
  }, [simStreamPhase, onContinue]);
```

Delete it entirely. The user (or the inactivity timeout inside the queue, plus the dock click) is now the only signal that advances the screen.

`mountedAtRef` becomes unused. Remove its declaration too:

```tsx
  const mountedAtRef = useRef(Date.now());
```

(If `mountedAtRef` is referenced elsewhere, leave it — but at the time of writing it's only used by the effect we just deleted.)

- [ ] **Step 6: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(processing): user-paced phase gates; remove auto-advance effect"
```

---

## Task 7: Layout, typography, and constellation polish

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx`

- [ ] **Step 1: Bump grid column width 360 → 420**

Find the grid template (around line 937):

```tsx
        gridTemplateColumns: "minmax(0, 1fr) 360px",
```

Change to:

```tsx
        gridTemplateColumns: "minmax(0, 1fr) 420px",
```

- [ ] **Step 2: Drop constellation opacity at phase 3**

The SVG element renders around line 945. Wrap the SVG (or apply directly to its `style`) with phase-driven opacity. Replace:

```tsx
            <svg
              viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ width: "100%", height: "100%", display: "block" }}
            >
```

with:

```tsx
            <svg
              viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                opacity: phase === 3 ? 0.85 : 1,
                transition: "opacity 1.4s var(--ease)",
              }}
            >
```

- [ ] **Step 3: Route constellation `activeIdx` through paced view**

Find this line (around line 794):

```tsx
  const active = activeIdx >= 0 ? outline[activeIdx] : null;
```

Add directly underneath:

```tsx
  // For the SVG node-pulse, use the paced view so the highlighted actors match
  // the visible text on the right column. Falls back to the raw `activeIdx`
  // before the queue has dispensed anything (so first-event arrival animation
  // still plays immediately).
  const svgActiveIdx = pacedActiveIdx >= 0 ? pacedActiveIdx : activeIdx;
  const svgActive = svgActiveIdx >= 0 ? outline[svgActiveIdx] : active;
```

Then in the `decoratedNodes` derivation (around line 827) and `activePulse`/`activePulse`-related closures, replace `active` with `svgActive` and `activeIdx` with `svgActiveIdx` in **the SVG block only** (not the right column).

Specifically, find these references inside the `<svg>` block:

- `activePulse(agentId)` reads from `active` — change the function body to read from `svgActive` instead.
- `(phase === 1 && lastArrived?.agent.agent_id === n.agent.agent_id)` — leave alone.
- The YearAxis call passes `activeIdx={activeIdx}` — change to `activeIdx={svgActiveIdx}`.

The `activePulse` function around line 816 should become:

```tsx
  function activePulse(agentId: string): number {
    if (!svgActive || svgActive.filledAt === undefined) return 0;
    if (!svgActive.primary_actors.includes(agentId)) return 0;
    const dt = now - svgActive.filledAt;
    if (dt < 0 || dt > EVENT_PULSE_MS) return 0;
    const x = dt / EVENT_PULSE_MS;
    return Math.max(0, 1 - x) * (1 + 0.3 * Math.sin(dt / 90));
  }
```

YearAxis call (around line 1118):

```tsx
              <YearAxis
                from={startYear}
                to={endYear}
                outline={outline}
                activeIdx={svgActiveIdx}
                phase={phase}
                now={now}
                planArrivedAt={planArrivedAt}
              />
```

- [ ] **Step 4: Phase-1 right-column typography upgrade**

Inside `{!isError && displayedPhase === 1 && (...)}` block (around line 1170), update the agent card styles. Find:

```tsx
                  <div
                    className="serif"
                    style={{ fontSize: 19, fontStyle: "italic", color: "var(--ink)", letterSpacing: "0.005em" }}
                  >
                    {n.agent.name}
                  </div>
```

Change `fontSize: 19` → `fontSize: 21`.

Find:

```tsx
                  <div
                    className="serif"
                    style={{
                      fontSize: 14,
                      fontStyle: "italic",
                      color: "var(--ink-2)",
                      marginTop: 6,
                      lineHeight: 1.4,
                    }}
                  >
                    {n.agent.relationship}
                  </div>
```

Change `fontSize: 14` → `fontSize: 16` and `color: "var(--ink-2)"` → `color: "var(--ink-1)"`.

- [ ] **Step 5: Phase-2 right-column typography upgrade**

Inside `{!isError && displayedPhase === 2 && (...)}` (around line 1218), find:

```tsx
                    <span
                      className="serif"
                      style={{ fontStyle: "italic", color: "var(--ink-1)", fontSize: 16, lineHeight: 1.35 }}
                    >
                      {o.hint}
                    </span>
```

Change `fontSize: 16` → `fontSize: 17` and `lineHeight: 1.35` → `lineHeight: 1.45`.

- [ ] **Step 6: Run typecheck and build**

```bash
cd frontend && npm run typecheck && npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "polish(processing): wider column, phase-3 dim, paced activeIdx, typography"
```

---

## Task 8: Verification

- [ ] **Step 1: Run typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: PASS, no errors.

- [ ] **Step 2: Run build**

```bash
cd frontend && npm run build
```

Expected: PASS, no errors. Look for any new warnings in the output.

- [ ] **Step 3: Manual smoke test**

Start backend (`./scripts/dev.sh`) and frontend (`cd frontend && npm run dev`). Open the app, complete the intake, and watch the processing screen.

Verify:
- Phase 1: cast appears in the right column, dock shows `streaming` then transitions to `press space · next →` once all agents have arrived. Pressing Space advances to phase 2.
- Phase 2: plan hints appear, dock returns to `revealing` then `ready`. Pressing Right advances to phase 3.
- Phase 3: first event auto-reveals (no prompt). Subsequent events wait — dock shows `press space · next →` after each one's bubbles complete. No event is overwritten mid-reveal even if backend streams quickly.
- Older events remain visible above, faded. Top of column has a soft fade mask.
- Pressing Enter, Space, Right Arrow, or clicking the dock all advance.
- Constellation graph still pulses on raw events (so user knows things are arriving), but the highlighted actors match the visible text.
- Phase 4: dock reads `meet yourself →`. User must click to advance.
- ArrowLeft still navigates back.

If everything looks right, no further commit needed.

- [ ] **Step 4: Final summary commit (only if README/docs need updating; otherwise skip)**

No README changes expected. Skip.

---

## Out of scope (deferred)

- Per-entry `next →` hints. Replaced by the persistent dock.
- Frontend test harness. Verification is typecheck + build + manual.
- Backend changes.
- Other screens.
