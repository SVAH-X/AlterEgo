// frontend/src/screens/processing-story.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
