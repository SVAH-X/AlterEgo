import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { clamp } from "../atoms";
import type { AgentSpec, Checkpoint } from "../types";
import type { FilledOutline } from "../App";

export const BUBBLE_STAGGER_MS = 700;
export const READY_HINT_DELAY_MS = 600;
export const INACTIVITY_TIMEOUT_MS = 30_000;
export const ENTRY_FADE_MS = 600;

export interface Bubble {
  who: string;
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
        revealStartedAt: 0,
      };
      queueRef.current.push(entry);
    });
  }, [outline, agents]);

  const dispense = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) return;
    next.revealStartedAt = performance.now();
    setVisible((v) => [...v, next]);
  }, []);

  const advance = useCallback(() => {
    setLastInputAt(performance.now());
    dispense();
  }, [dispense]);

  // Auto-start the first event so the screen doesn't open on a static prompt.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!active) return;
    if (queueRef.current.length === 0) return;
    autoStartedRef.current = true;
    dispense();
  }, [outline, active, dispense]);

  const current = visible[visible.length - 1] ?? null;
  const currentBubbleCount = current?.bubbles.length ?? 0;
  const currentRevealEndsAt =
    current !== null
      ? current.revealStartedAt +
        currentBubbleCount * BUBBLE_STAGGER_MS +
        READY_HINT_DELAY_MS
      : 0;

  // Demo-safety auto-dispense if the user goes idle. Scheduled once per
  // (current entry, last input) pair instead of polled every rAF tick.
  useEffect(() => {
    if (current === null) return;
    const idleStart = Math.max(currentRevealEndsAt, lastInputAt);
    const delay = Math.max(0, idleStart + INACTIVITY_TIMEOUT_MS - performance.now());
    const t = window.setTimeout(() => {
      if (queueRef.current.length === 0) return;
      dispense();
    }, delay);
    return () => window.clearTimeout(t);
  }, [current, currentRevealEndsAt, lastInputAt, dispense]);

  const hasNext = queueRef.current.length > 0;
  const drained =
    !hasNext &&
    outline.length > 0 &&
    outline.every((o) => o.filled);

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

export interface ScrollEntryProps {
  entry: ScrollEntry;
  /** Recency rank: 0 for the active entry, 1 for the one above, etc. */
  rank: number;
  age: number | null;
  now: number;
}

const RECENCY_OPACITY = [1.0, 0.7, 0.55, 0.45];

export function ScrollEntryView({ entry, rank, age, now }: ScrollEntryProps) {
  const isActive = rank === 0;
  const [hovered, setHovered] = useState(false);
  const baseOpacity = RECENCY_OPACITY[Math.min(rank, RECENCY_OPACITY.length - 1)];
  const opacity = isActive ? 1 : (hovered ? 1 : baseOpacity);

  const visibleBubbles = isActive
    ? entry.bubbles.filter(
        (_, i) => now - entry.revealStartedAt >= i * BUBBLE_STAGGER_MS,
      )
    : entry.bubbles;

  const enterAlpha = clamp((now - entry.revealStartedAt) / ENTRY_FADE_MS, 0, 1);
  const enterShift = (1 - enterAlpha) * 14;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: opacity * (isActive ? enterAlpha : 1),
        transform: isActive ? `translateY(${enterShift}px)` : undefined,
        transition: isActive
          ? "opacity 400ms var(--ease)"
          : "opacity 400ms var(--ease)",
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: 14,
        paddingBottom: isActive ? 0 : 14,
        borderBottom: isActive ? "none" : "1px solid var(--line-soft)",
      }}
    >
      {/* gutter: year sigil + age */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          paddingTop: 2,
          gap: 6,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: isActive ? "var(--accent)" : "var(--ink-2)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 400ms var(--ease)",
          }}
        >
          {entry.checkpoint.year}
        </div>
        {age !== null && (
          <div
            className="mono"
            style={{
              fontSize: 8.5,
              letterSpacing: "0.22em",
              color: "var(--ink-3)",
              textTransform: "uppercase",
            }}
          >
            age {age}
          </div>
        )}
        {/* sigil: small diamond connecting to constellation language */}
        <div
          style={{
            marginTop: 6,
            width: 6,
            height: 6,
            transform: "rotate(45deg)",
            background: isActive ? "var(--accent)" : "var(--ink-4)",
            boxShadow: isActive ? "0 0 8px var(--accent-line)" : "none",
            transition: "background 400ms var(--ease), box-shadow 400ms var(--ease)",
          }}
        />
      </div>

      {/* body */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: isActive ? 14 : 8,
          borderLeft: isActive
            ? "1px solid var(--accent-line)"
            : "1px solid var(--line-soft)",
          paddingLeft: 16,
          transition: "border-color 400ms var(--ease)",
        }}
      >
        <div
          className="serif"
          style={{
            fontSize: isActive ? 22 : 17,
            fontStyle: "italic",
            lineHeight: 1.3,
            color: isActive ? "var(--ink)" : "var(--ink-1)",
            letterSpacing: "0.005em",
          }}
        >
          {entry.checkpoint.title || entry.bubbles[0]?.line}
        </div>

        {visibleBubbles.map((b, j) => (
          <div
            key={`${entry.outlineIdx}-${j}`}
            style={{ animation: isActive ? "fade-in 600ms var(--ease) both" : undefined }}
          >
            <div
              className="mono"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.22em",
                color: b.who === "narrator" ? "var(--ink-3)" : "var(--accent)",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {b.who === "narrator" ? "—— narrator" : b.who}
            </div>
            <div
              className="serif"
              style={{
                fontSize: isActive ? (b.who === "narrator" ? 17 : 18) : 14.5,
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
 * Each advance (space / next button) snaps to the bottom and keeps the new
 * entry pinned for the duration of its bubble reveal so growing content stays
 * in view. Between advances the user can freely scroll up to re-read.
 */
export function StoryScroll({ visible, now }: StoryScrollProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const last = visible[visible.length - 1];
    if (!last) return;

    const revealEndsAt =
      last.revealStartedAt +
      last.bubbles.length * BUBBLE_STAGGER_MS +
      READY_HINT_DELAY_MS;

    let raf = 0;
    const stick = () => {
      if (!containerRef.current) return;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      if (performance.now() < revealEndsAt) {
        raf = requestAnimationFrame(stick);
      }
    };
    raf = requestAnimationFrame(stick);
    return () => cancelAnimationFrame(raf);
  }, [visible.length]);

  return (
    <div
      ref={containerRef}
      className="scroll-amber"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        paddingTop: 28,
        paddingRight: 14,
        paddingBottom: 4,
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0, #000 56px, #000 calc(100% - 8px), transparent 100%)",
        maskImage:
          "linear-gradient(to bottom, transparent 0, #000 56px, #000 calc(100% - 8px), transparent 100%)",
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
