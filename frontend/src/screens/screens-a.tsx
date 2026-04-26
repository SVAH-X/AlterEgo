import { useEffect, useMemo, useRef, useState } from "react";
import type { FilledOutline, ScreenProps, SimStreamPhase } from "../App";
import { clamp, Mark, Meta, PortraitImage, Wave, useStreamedText } from "../atoms";
import { AE_DATA } from "../data";
import { nearestPortrait } from "../lib/portraits";
import type { AgentSpec, Checkpoint, Profile } from "../types";
import romanStatue from "../assets/roman-half-blur.png";
import darkClouds from "../assets/dark-grey-clouds-over-the-ocean.jpg";
import { useVoice, useVoicePrimed } from "../voice/VoiceContext";
import { useTTSPlayer } from "../voice/useTTSPlayer";
import { MicButton } from "../voice/MicButton";
import { cloneVoice } from "../lib/voice";

export function ScreenLanding({ onContinue, onJumpTo }: ScreenProps) {
  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      {/* Whole hero advances to the selfie choice screen. */}
      <button
        type="button"
        onClick={onContinue}
        aria-label="Click anywhere to begin"
        className="landing-hero"
        style={{
          all: "unset",
          cursor: "pointer",
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)",
          alignItems: "center",
          padding: "clamp(72px, 11vh, 100px) clamp(20px, 6vw, 96px) clamp(96px, 16vh, 140px)",
          gap: "clamp(24px, 4vw, 72px)",
          boxSizing: "border-box",
          animation: "fade-in 1100ms var(--ease) 200ms both",
        }}
      >
        <div
          className="landing-hero-text"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(28px, 5vw, 56px)",
          }}
        >
          <h1
            aria-label="Alter Ego"
            className="serif landing-hero-title"
            style={{
              fontSize: "clamp(72px, 19vw, 280px)",
              lineHeight: 0.6,
              fontWeight: 400,
              letterSpacing: "-0.025em",
              margin: 0,
              padding: "0.35em 0.1em",
              textAlign: "center",
              userSelect: "none",
              backgroundImage: `linear-gradient(rgb(248 182 58 / 38%) 0%, rgb(137 109 82 / 55%) 100%), url(${darkClouds})`,
              backgroundSize: "cover",
              backgroundPosition: "center 55%",
              backgroundRepeat: "no-repeat",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              WebkitTextFillColor: "transparent",
            }}
          >
            <span style={{ display: "block" }}>alter</span>
            <span style={{ display: "block" }}>ego</span>
          </h1>

          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              lineHeight: 1.7,
              textAlign: "center",
              color: "var(--ink-1)",
              animation: "fade-in 900ms var(--ease) 1300ms both",
            }}
          >
            Click anywhere to begin
            <br />
            <span style={{ color: "var(--accent)" }}>see where your life is heading</span>
          </div>
        </div>

        <div
          className="landing-hero-image"
          style={{
            position: "relative",
            justifySelf: "center",
            width: "min(520px, 100%, 55vh)",
            aspectRatio: "3 / 4",
            borderRadius: "50% 50% 0 0 / 32% 32% 0 0",
            overflow: "hidden",
            background:
              "radial-gradient(ellipse at 50% 30%, #87725e 0%, #574a3d 78%)",
            boxShadow:
              "inset 0 0 0 1px var(--line-soft), 0 40px 80px -40px rgba(0,0,0,0.65)",
            animation: "fade-in 1800ms var(--ease) 700ms both",
          }}
        >
          <img
            src={romanStatue}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 25%",
              transform: "scale(1.25)",
              transformOrigin: "50% 25%",
              filter: "contrast(1.05) saturate(0.9) brightness(1.02) sepia(0.04)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 50% 25%, transparent 60%, rgba(30,22,14,0.45) 100%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </button>

    </div>
  );
}

type DyadSide = { slug: string; label: string };
type DyadSpec = { slug: string; left: DyadSide; right: DyadSide };

const VALUES_DYADS: DyadSpec[] = [
  {
    slug: "respected_liked",
    left: { slug: "respected", label: "Respected" },
    right: { slug: "liked", label: "Liked" },
  },
  {
    slug: "certainty_possibility",
    left: { slug: "certainty", label: "Certainty" },
    right: { slug: "possibility", label: "Possibility" },
  },
  {
    slug: "honest_kind",
    left: { slug: "honest", label: "Honest" },
    right: { slug: "kind", label: "Kind" },
  },
  {
    slug: "movement_roots",
    left: { slug: "movement", label: "Movement" },
    right: { slug: "roots", label: "Roots" },
  },
  {
    slug: "life_scope",
    left: { slug: "smaller_well", label: "A smaller life done well" },
    right: { slug: "bigger_okay", label: "A bigger life done okay" },
  },
];

const MBTI_TYPES: string[] = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

type IntakeField =
  | { key: keyof Profile; label: string; placeholder: string; type: "text" | "textarea"; suffix?: string }
  | { key: keyof Profile; label: string; placeholder: string; type: "number"; suffix?: string }
  | { key: "mbti"; label: string; type: "mbti"; suffix?: string }
  | { key: "values"; label: string; type: "dyads"; dyads: DyadSpec[]; suffix?: string };

const INTAKE_FIELDS: IntakeField[] = [
  { key: "name", label: "What should I call you?", placeholder: "Your name", type: "text" },
  { key: "age", label: "How old are you, today?", placeholder: "32", type: "number" },
  { key: "occupation", label: "What do you do for work?", placeholder: "Marketing director", type: "text" },
  { key: "workHours", label: "Hours per week, honestly.", placeholder: "65", type: "number" },
  {
    key: "topGoal",
    label: "What do you want, more than anything?",
    placeholder: "Build something I'm proud of before forty",
    type: "textarea",
  },
  {
    key: "topFear",
    label: "What are you afraid of?",
    placeholder: "Looking up at fifty and realizing I optimized for the wrong thing",
    type: "textarea",
  },
  {
    key: "mbti",
    label: "Your MBTI, if you know it.",
    type: "mbti",
    suffix: "Skip if you don't. It's optional — a hint, not a label.",
  },
  {
    key: "values",
    label: "Pick one in each pair. There's no right answer — just yours.",
    type: "dyads",
    dyads: VALUES_DYADS,
  },
  {
    key: "targetYear",
    label: "How many years should I look ahead?",
    placeholder: "20",
    type: "number",
    suffix: "Twenty feels right. Five if you want it close. Thirty if you want to see far.",
  },
];

function autoSizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function ScreenIntake({ onContinue, onJumpTo, profile, setProfile, pushVoiceSample }: ScreenProps) {
  const [step, setStep] = useState(0);
  const cur = INTAKE_FIELDS[step];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { voiceMode, pushIntakeSample, pushIntakeSeconds } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();

  // Auto-play the current question when entering voice mode.
  useEffect(() => {
    if (voiceMode && voicePrimed) tts.play(cur.label);
    else tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, voiceMode, voicePrimed]);

  function onRecorded(blob: Blob, durationMs: number) {
    // Open-ended fields make the best cloning samples.
    if (cur.type === "textarea" || cur.type === "text") {
      pushIntakeSample(blob);
      pushIntakeSeconds(durationMs / 1000);
    }
  }

  function next() {
    if (cur.type === "dyads") {
      const picks = profile.values ?? {};
      const allAnswered = cur.dyads.every((d) => Boolean(picks[d.slug]));
      if (!allAnswered) return;
    }
    tts.stop();
    if (step < INTAKE_FIELDS.length - 1) setStep(step + 1);
    else onContinue();
  }

  // For targetYear we display *years ahead* in the input but persist the
  // absolute year on the profile. Everything downstream still consumes
  // profile.targetYear as an absolute year.
  const isYearsAheadField = cur.key === "targetYear";
  const value = isYearsAheadField
    ? Math.max(0, profile.targetYear - profile.presentYear)
    : profile[cur.key];

  // One setter for both keystrokes and live transcripts. Voice input on a
  // number field arrives chatty ("about thirty two years"), so we extract
  // the first integer; if no digit shows up yet we hold the previous value
  // instead of clobbering it with 0.
  function applyValue(raw: string, source: "type" | "voice") {
    if (cur.type !== "number") {
      setProfile({ ...profile, [cur.key]: raw });
      return;
    }
    let n: number;
    if (source === "voice") {
      const m = raw.match(/-?\d+/);
      if (!m) return;
      n = Number(m[0]);
    } else {
      // Strip anything that isn't a digit so users can't paste
      // non-numeric content; empty string is allowed (clears field).
      const digits = raw.replace(/[^0-9]/g, "");
      n = digits === "" ? 0 : Number(digits);
    }
    if (isYearsAheadField) {
      setProfile({
        ...profile,
        targetYear: profile.presentYear + (Number.isFinite(n) ? n : 0),
      });
    } else {
      setProfile({ ...profile, [cur.key]: Number.isFinite(n) ? n : 0 });
    }
  }

  // Number inputs show "" for 0 so the field reads as empty when cleared.
  // Text inputs show their string verbatim (empty string already renders empty).
  const displayValue =
    cur.type === "mbti" || cur.type === "dyads"
      ? ""
      : cur.type === "number"
        ? value && Number(value) !== 0
          ? String(value)
          : ""
        : ((value as string | undefined) ?? "");

  // Re-measure the textarea when entering a textarea step or when the value
  // changes (e.g., paste). Auto-resize on input also runs in onChange.
  useEffect(() => {
    if (cur.type === "textarea") autoSizeTextarea(textareaRef.current);
  }, [step, cur.type, displayValue]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "stretch",
          maxWidth: 760,
          margin: "0 auto",
          width: "100%",
          padding: "0 40px",
        }}
      >
        <div key={step} style={{ animation: "fade-in 600ms var(--ease) both" }}>
          <Meta style={{ marginBottom: 24 }}>
            question {String(step + 1).padStart(2, "0")}
          </Meta>
          <label
            className="serif"
            style={{
              fontSize: 36,
              lineHeight: 1.25,
              color: "var(--ink-1)",
              display: "block",
              marginBottom: 36,
              letterSpacing: "0.005em",
              fontStyle: "italic",
            }}
          >
            {cur.label}
          </label>
          {cur.type === "textarea" ? (
            <textarea
              ref={textareaRef}
              className="field auto-grow"
              rows={1}
              autoFocus
              placeholder={cur.placeholder}
              value={displayValue}
              onChange={(e) => {
                autoSizeTextarea(e.currentTarget);
                applyValue(e.target.value, "type");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) next();
              }}
            />
          ) : cur.type === "mbti" ? (
            <MbtiPicker
              value={profile.mbti ?? null}
              onPick={(t) => setProfile({ ...profile, mbti: t })}
            />
          ) : cur.type === "dyads" ? (
            <DyadsPicker
              dyads={cur.dyads}
              value={profile.values ?? {}}
              onPick={(slug, side) =>
                setProfile({
                  ...profile,
                  values: { ...(profile.values ?? {}), [slug]: side },
                })
              }
            />
          ) : (
            <input
              className="field"
              autoFocus
              type={cur.type === "number" ? "text" : cur.type}
              inputMode={cur.type === "number" ? "numeric" : undefined}
              pattern={cur.type === "number" ? "[0-9]*" : undefined}
              placeholder={cur.placeholder}
              value={displayValue}
              onChange={(e) => applyValue(e.target.value, "type")}
              onKeyDown={(e) => {
                if (e.key === "Enter") next();
              }}
            />
          )}

          {cur.type !== "mbti" && cur.type !== "dyads" && (
            <MicButton
              onTranscript={(text) => applyValue(text, "voice")}
              onRecorded={(blob, durationMs) => {
                onRecorded(blob, durationMs);
                pushVoiceSample(blob);
              }}
            />
          )}

          {cur.suffix && (
            <div
              style={{
                marginTop: 18,
                color: "var(--ink-3)",
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 17,
              }}
            >
              {cur.suffix}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "32px 40px",
          maxWidth: 760,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <button
          className="under"
          onClick={() => setStep(Math.max(0, step - 1))}
          style={{ visibility: step === 0 ? "hidden" : "visible" }}
        >
          ← previous
        </button>

        <div style={{ display: "flex", gap: 4 }}>
          {INTAKE_FIELDS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 18,
                height: 1,
                background: i <= step ? "var(--ink-1)" : "var(--ink-4)",
                transition: "background 600ms var(--ease)",
              }}
            />
          ))}
        </div>

        <button className="under" onClick={next}>
          {step === INTAKE_FIELDS.length - 1 ? "begin →" : "continue →"}
        </button>
      </div>
    </div>
  );
}

function MbtiPicker({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (mbti: string | null) => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {MBTI_TYPES.map((t) => {
          const selected = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(selected ? null : t)}
              className="under"
              style={{
                padding: "14px 0",
                fontFamily: "var(--mono)",
                fontSize: 15,
                letterSpacing: "0.06em",
                color: selected ? "var(--bg)" : "var(--ink-1)",
                background: selected ? "var(--ink-1)" : "transparent",
                border: "1px solid var(--ink-3)",
                borderRadius: 4,
                cursor: "pointer",
                transition:
                  "background 200ms var(--ease), color 200ms var(--ease)",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onPick(null)}
        className="under"
        style={{
          marginTop: 18,
          color: value == null ? "var(--ink-1)" : "var(--ink-3)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontStyle: "italic",
        }}
      >
        skip / clear
      </button>
    </div>
  );
}

function DyadsPicker({
  dyads,
  value,
  onPick,
}: {
  dyads: DyadSpec[];
  value: Record<string, string>;
  onPick: (slug: string, side: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {dyads.map((d) => {
        const chosen = value[d.slug];
        const renderSide = (side: DyadSide) => {
          const selected = chosen === side.slug;
          return (
            <button
              key={side.slug}
              type="button"
              onClick={() => onPick(d.slug, side.slug)}
              style={{
                flex: 1,
                padding: "14px 18px",
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 18,
                color: selected ? "var(--bg)" : "var(--ink-1)",
                background: selected ? "var(--ink-1)" : "transparent",
                border: "1px solid var(--ink-3)",
                borderRadius: 4,
                cursor: "pointer",
                textAlign: "center",
                transition:
                  "background 200ms var(--ease), color 200ms var(--ease)",
              }}
            >
              {side.label}
            </button>
          );
        };
        return (
          <div key={d.slug} style={{ display: "flex", gap: 10 }}>
            {renderSide(d.left)}
            {renderSide(d.right)}
          </div>
        );
      })}
    </div>
  );
}


// =============================================================================
// SCREEN: PROCESSING — "the constellation forming"
//
// A graph of the user's life builds itself in real time off the live /simulate
// stream. Four visible phases mapped from `simStreamPhase`:
//
//   counting  → agents float in around the YOU node, captioned as they arrive
//   plan      → year axis fades in beneath the graph; ghost events appear at
//               their year with the planner's hint
//   events    → each fired Checkpoint pulses its primary actors, animates an
//               edge between them, lights up the year-axis marker, and plays
//               2–3 dialogue / narration bubbles in the story column
//   finalizing → agents drift outward, an "older you" materializes at center
// =============================================================================

const GRAPH_W = 760;
const GRAPH_H = 560;
const RING_RADII: Record<number, number> = { 1: 130, 2: 215, 3: 295 };

const RING_BY_ROLE: Record<string, number> = {
  partner: 1, mother: 1, father: 1, sister: 1, brother: 1,
  child: 1, close_friend: 1,
  manager: 2, colleague: 2, mentor: 2,
  industry_voice: 3, rival: 3, ex: 3,
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

interface NodeLayout {
  agent: AgentSpec;
  ring: number;
  theta: number;
  x: number;
  y: number;
}

function layoutAgents(agents: AgentSpec[]): NodeLayout[] {
  const others = agents.filter((a) => a.agent_id !== "user");
  const buckets: Record<number, AgentSpec[]> = { 1: [], 2: [], 3: [] };
  for (const a of others) {
    const ring = RING_BY_ROLE[a.role] ?? 2;
    buckets[ring].push(a);
  }
  const out: NodeLayout[] = [];
  const cx = GRAPH_W / 2;
  const cy = GRAPH_H / 2;
  for (const ring of [1, 2, 3] as const) {
    const list = buckets[ring];
    if (list.length === 0) continue;
    list.sort((a, b) => a.agent_id.localeCompare(b.agent_id));
    const step = (Math.PI * 2) / list.length;
    list.forEach((agent, i) => {
      const jitter = (hashId(agent.agent_id) - 0.5) * step * 0.55;
      const theta = i * step + jitter - Math.PI / 2;
      const r = RING_RADII[ring];
      out.push({
        agent,
        ring,
        theta,
        x: cx + Math.cos(theta) * r,
        y: cy + Math.sin(theta) * r,
      });
    });
  }
  return out;
}

interface Bubble {
  who: string;
  line: string;
}

function makeBubbles(cp: Checkpoint, agents: AgentSpec[], actors: string[]): Bubble[] {
  const cast = new Map(agents.map((a) => [a.agent_id, a]));
  const actorNames = actors
    .map((id) => cast.get(id)?.name)
    .filter((n): n is string => Boolean(n) && n !== "You");

  const bubbles: Bubble[] = [];
  const quoteRe = /"([^"]+)"/;
  const m = quoteRe.exec(cp.event);
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

// Error gets its own sentinel (0) so the body switches to a dedicated error
// panel rather than rendering the cosmetic "composing the monologue" UI.
const PHASE_TO_STEP: Record<SimStreamPhase, number> = {
  idle: 1, counting: 1, plan: 2, events: 3, finalizing: 4, complete: 4, error: 0,
};

// Throttle the rAF master clock to ~30fps. The animations are 700ms–4200ms
// decay curves; 30fps is visually indistinguishable from 60fps but cuts
// re-renders in half.
const TICK_INTERVAL_MS = 33;

const ARRIVAL_FADE_MS = 700;
const PLAN_REVEAL_MS = 700;
const EVENT_PULSE_MS = 4200;

export function ScreenProcessing({
  onContinue,
  onJumpTo,
  profile,
  simStreamPhase,
  agents,
  agentArrivedAt,
  outline,
  planArrivedAt,
  errorMessage,
  portraitsDone,
  runSimulate,
}: ScreenProps) {
  const [now, setNow] = useState(() => performance.now());
  const mountedAtRef = useRef(Date.now());
  const { intakeSamples, intakeSamplesSeconds, setClonedVoiceId } = useVoice();

  // Voice cloning runs in parallel with /simulate. Skip if no samples or
  // the audio is too short to produce a usable clone (~5s minimum).
  useEffect(() => {
    if (intakeSamples.length === 0 || intakeSamplesSeconds < 5) return;
    let cancelled = false;
    (async () => {
      try {
        const id = await cloneVoice(intakeSamples, `alterego-${Date.now()}`);
        if (!cancelled) setClonedVoiceId(id);
      } catch (e) {
        console.warn("voice clone failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= TICK_INTERVAL_MS) {
        last = t;
        setNow(performance.now());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    runSimulate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (simStreamPhase !== "complete") return;
    const elapsed = Date.now() - mountedAtRef.current;
    const wait = Math.max(1200, 5000 - elapsed);
    const t = setTimeout(() => onContinue(), wait);
    return () => clearTimeout(t);
  }, [simStreamPhase, onContinue]);

  const phase = PHASE_TO_STEP[simStreamPhase] ?? 1;
  const isError = simStreamPhase === "error";
  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;

  // Layout is stable across frames once agents arrive; everything below uses
  // it as a foundation, with `now`-derived values computed on each render.
  const layout = useMemo(() => layoutAgents(agents), [agents]);

  const agentWeight = useMemo(() => {
    const w: Record<string, number> = {};
    for (const a of agents) w[a.agent_id] = 0;
    for (const o of outline) {
      if (!o.filled) continue;
      for (const id of o.primary_actors) {
        if (id in w) w[id] += 1;
      }
    }
    return w;
  }, [agents, outline]);

  const activeIdx = useMemo(() => {
    let best = -1;
    let bestT = -Infinity;
    outline.forEach((o, i) => {
      if (o.filled && o.filledAt !== undefined && o.filledAt > bestT) {
        best = i;
        bestT = o.filledAt;
      }
    });
    return best;
  }, [outline]);
  const active = activeIdx >= 0 ? outline[activeIdx] : null;
  const activeAge = active?.checkpoint?.age ?? null;

  // Bubbles for the active event — extraction (regex + map build) is memoized
  // on the checkpoint identity. Staggered visibility is sliced from `now`
  // on each render, which is cheap.
  const allBubbles = useMemo(
    () =>
      active?.checkpoint
        ? makeBubbles(active.checkpoint, agents, active.primary_actors)
        : [],
    [active?.checkpoint, agents, active?.primary_actors],
  );

  // ---- per-frame derivations (cheap; no useMemo because `now` invalidates every tick) ----

  function arrivalAlpha(agentId: string): number {
    const t = agentArrivedAt[agentId];
    if (t === undefined) return 0;
    return clamp((now - t) / ARRIVAL_FADE_MS, 0, 1);
  }
  function activePulse(agentId: string): number {
    if (!active || active.filledAt === undefined) return 0;
    if (!active.primary_actors.includes(agentId)) return 0;
    const dt = now - active.filledAt;
    if (dt < 0 || dt > EVENT_PULSE_MS) return 0;
    const x = dt / EVENT_PULSE_MS;
    return Math.max(0, 1 - x) * (1 + 0.3 * Math.sin(dt / 90));
  }

  // Decorate each laid-out node with everything the SVG needs, computed once
  // per frame, so the edge and node `<g>` blocks share derivations.
  const decoratedNodes = layout
    .map((n) => {
      const arrivedAt = agentArrivedAt[n.agent.agent_id];
      if (arrivedAt === undefined || now < arrivedAt) return null;
      const w = agentWeight[n.agent.agent_id] || 0;
      const pulse = activePulse(n.agent.agent_id);
      const alpha = arrivalAlpha(n.agent.agent_id);
      return { ...n, w, pulse, alpha };
    })
    .filter(<T,>(n: T | null): n is T => n !== null);
  const lastArrived = decoratedNodes[decoratedNodes.length - 1];

  const visibleBubbles = active?.filledAt !== undefined
    ? allBubbles.filter((_, i) => now - active.filledAt! >= i * 600)
    : [];

  let finalProgress = 0;
  if (simStreamPhase === "finalizing" || simStreamPhase === "complete") {
    const finalStart =
      outline.reduce<number | null>(
        (acc, o) =>
          o.filledAt !== undefined && (acc === null || o.filledAt > acc) ? o.filledAt : acc,
        null,
      ) ?? now;
    finalProgress = clamp((now - finalStart) / 4500, 0, 1);
  }

  const filledCount = outline.filter((o) => o.filled).length;
  let pct = 0;
  if (phase >= 1) pct = 8;
  if (phase >= 2) pct = 22;
  if (phase >= 3) {
    pct = 22 + Math.round((filledCount / Math.max(1, outline.length)) * 60);
  }
  if (phase >= 4) pct = Math.max(pct, 88 + Math.round(finalProgress * 11));
  if (simStreamPhase === "complete") pct = 100;
  pct = clamp(pct, 0, 100);

  const phaseLabel = isError
    ? "the simulation faltered"
    : ["", "counting", "planning", "events", "finalizing"][phase];
  const phaseStep = isError
    ? "—— / 04"
    : ["", "01 / 04", "02 / 04", "03 / 04", "04 / 04"][phase];

  // Story-column header text — branches off phase + error in one place
  // rather than the same nested ternary appearing inline in JSX.
  const storyHeader = isError
    ? "stream interrupted · using sample"
    : phase === 1
      ? "drafting the cast"
      : phase === 2
        ? "placing the years"
        : phase === 3
          ? `writing checkpoint ${String(filledCount).padStart(2, "0")} / ${String(outline.length).padStart(2, "0")}`
          : "composing the monologue";

  const footnote = isError
    ? `${errorMessage?.slice(0, 80) ?? "stream interrupted"} · using sample`
    : phase === 1
      ? `${decoratedNodes.length} / ${layout.length || "—"} people · drafting`
      : phase === 2
        ? `${outline.length} checkpoints placed on the year axis`
        : phase === 3
          ? `checkpoint ${filledCount} / ${outline.length} · ${active?.year ?? ""}`
          : `composing${portraitsDone > 0 ? ` · portraits ${portraitsDone} / 10` : ""}`;

  const cx = GRAPH_W / 2;
  const cy = GRAPH_H / 2;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 30,
          right: 32,
          display: "flex",
          alignItems: "center",
          gap: 14,
          animation: "fade-in 800ms var(--ease) both",
          zIndex: 4,
        }}
      >
        <span className="meta">phase {phaseStep}</span>
        <span style={{ width: 24, height: 1, background: "var(--line)" }} />
        <span
          className="serif"
          style={{
            fontStyle: "italic",
            color: isError ? "var(--warn)" : "var(--accent)",
            fontSize: 17,
            letterSpacing: "0.005em",
          }}
        >
          {phaseLabel}
        </span>
        <span style={{ width: 24, height: 1, background: "var(--line)" }} />
        <span className="meta" style={{ fontVariantNumeric: "tabular-nums" }}>
          {String(pct).padStart(2, "0")} %
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 24,
          padding: "92px 40px 30px 40px",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <svg
              viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ width: "100%", height: "100%", display: "block" }}
            >
              <defs>
                <radialGradient id="haze" cx="50%" cy="50%">
                  <stop offset="0%" stopColor="oklch(0.74 0.09 65 / 0.18)" />
                  <stop offset="60%" stopColor="oklch(0.74 0.09 65 / 0.04)" />
                  <stop offset="100%" stopColor="oklch(0.74 0.09 65 / 0)" />
                </radialGradient>
                <radialGradient id="haze-warm" cx="50%" cy="50%">
                  <stop offset="0%" stopColor="oklch(0.74 0.09 65 / 0.35)" />
                  <stop offset="100%" stopColor="oklch(0.74 0.09 65 / 0)" />
                </radialGradient>
                <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <circle cx={cx} cy={cy} r={310} fill="url(#haze)" />

              {[130, 215, 295].map((r, i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="0.5"
                  strokeDasharray="2 6"
                  opacity={phase >= 1 ? 0.55 - i * 0.12 : 0}
                  style={{ transition: "opacity 1.6s var(--ease)" }}
                />
              ))}

              {decoratedNodes.map((n) => {
                const driftX = phase === 4 ? (n.x - cx) * 0.25 * finalProgress : 0;
                const driftY = phase === 4 ? (n.y - cy) * 0.25 * finalProgress : 0;
                const baseOp = 0.18 + Math.min(0.5, n.w * 0.16);
                const op = (baseOp + n.pulse * 0.45) * (1 - finalProgress * 0.5);
                return (
                  <line
                    key={`edge-${n.agent.agent_id}`}
                    x1={cx}
                    y1={cy}
                    x2={n.x + driftX}
                    y2={n.y + driftY}
                    stroke={n.w > 0 ? "var(--accent)" : "var(--ink-3)"}
                    strokeWidth={0.6 + Math.min(2.4, n.w * 0.45) + n.pulse * 1.5}
                    opacity={op * n.alpha}
                  />
                );
              })}

              {decoratedNodes.map((n) => {
                const driftX = phase === 4 ? (n.x - cx) * 0.25 * finalProgress : 0;
                const driftY = phase === 4 ? (n.y - cy) * 0.25 * finalProgress : 0;
                const px = n.x + driftX;
                const py = n.y + driftY;
                const r = 4 + Math.min(4, n.w * 0.7) + n.pulse * 3;
                const labelActive =
                  (phase === 1 && lastArrived?.agent.agent_id === n.agent.agent_id) ||
                  n.pulse > 0.1;
                return (
                  <g key={`node-${n.agent.agent_id}`} opacity={n.alpha * (1 - finalProgress * 0.4)}>
                    {(n.w > 1 || n.pulse > 0.05) && (
                      <circle
                        cx={px}
                        cy={py}
                        r={r + 6 + n.pulse * 8}
                        fill="url(#haze-warm)"
                        opacity={0.5 + n.pulse * 0.4}
                      />
                    )}
                    <circle
                      cx={px}
                      cy={py}
                      r={r}
                      fill={n.w > 0 ? "var(--accent)" : "var(--ink-1)"}
                      filter={n.pulse > 0.1 ? "url(#soft-glow)" : undefined}
                    />
                    <text
                      x={px + (Math.cos(n.theta) >= 0 ? 12 : -12)}
                      y={py + 4}
                      textAnchor={Math.cos(n.theta) >= 0 ? "start" : "end"}
                      fontFamily="var(--mono)"
                      fontSize="9.5"
                      letterSpacing="0.14em"
                      fill={labelActive ? "var(--ink)" : "var(--ink-3)"}
                      opacity={labelActive ? 1 : phase >= 2 ? 0.7 : 0.3}
                      style={{ textTransform: "uppercase", transition: "fill 800ms var(--ease)" }}
                    >
                      {n.agent.name.toUpperCase()}
                    </text>
                  </g>
                );
              })}

              <g>
                <circle cx={cx} cy={cy} r={28} fill="none" stroke="var(--accent-line)" strokeWidth="0.5" opacity={0.7} />
                <circle cx={cx} cy={cy} r={9} fill="var(--ink)" />
                {phase === 4 && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={9 + finalProgress * 14}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="0.8"
                      opacity={finalProgress * 0.9}
                    />
                    <circle cx={cx} cy={cy} r={9 + finalProgress * 6} fill="var(--accent)" opacity={finalProgress * 0.45} />
                  </>
                )}
                <text
                  x={cx}
                  y={cy + 48}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize="10"
                  letterSpacing="0.22em"
                  fill="var(--ink-2)"
                  style={{ textTransform: "uppercase" }}
                >
                  {phase < 4 ? (profile.name?.trim() || "you") : `you · ${endYear}`}
                </text>
              </g>

              {phase === 1 && lastArrived && (
                <g key={`cap-${lastArrived.agent.agent_id}`}>
                  <text
                    x={32}
                    y={GRAPH_H - 38}
                    fontFamily="var(--mono)"
                    fontSize="10"
                    letterSpacing="0.2em"
                    fill="var(--ink-3)"
                    style={{ textTransform: "uppercase" }}
                  >
                    + person {String(decoratedNodes.length).padStart(2, "0")} of{" "}
                    {String(layout.length).padStart(2, "0")}
                  </text>
                  <text x={32} y={GRAPH_H - 16} fontFamily="var(--serif)" fontSize="22" fontStyle="italic" fill="var(--ink)">
                    {lastArrived.agent.name}
                    <tspan fill="var(--ink-3)" fontSize="18">
                      {"  ·  "}
                      {lastArrived.agent.relationship.replace(/^(your |the )/i, "")}
                    </tspan>
                  </text>
                </g>
              )}
            </svg>
          </div>

          <div
            style={{
              marginTop: 14,
              opacity: phase >= 2 ? 1 : 0,
              transition: "opacity 1.4s var(--ease)",
              position: "relative",
            }}
          >
            <YearAxis
              from={startYear}
              to={endYear}
              outline={outline}
              activeIdx={activeIdx}
              phase={phase}
              now={now}
              planArrivedAt={planArrivedAt}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderLeft: "1px solid var(--line-soft)",
            paddingLeft: 24,
            position: "relative",
          }}
        >
          <Meta style={{ marginBottom: 18, color: isError ? "var(--warn)" : undefined }}>
            {storyHeader}
          </Meta>

          {isError && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fade-in 600ms var(--ease) both" }}>
              <div
                className="serif"
                style={{
                  fontSize: 17,
                  fontStyle: "italic",
                  color: "var(--ink-1)",
                  lineHeight: 1.45,
                }}
              >
                The simulation didn't finish. We'll show you a sample trajectory so you can keep going.
              </div>
              {errorMessage && (
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    lineHeight: 1.6,
                  }}
                >
                  {errorMessage.slice(0, 200)}
                </div>
              )}
            </div>
          )}

          {!isError && phase === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
              {decoratedNodes.map((n, i) => (
                <div
                  key={n.agent.agent_id}
                  style={{
                    animation: "fade-in 700ms var(--ease) both",
                    borderBottom: "1px solid var(--line-soft)",
                    paddingBottom: 12,
                    opacity: i === decoratedNodes.length - 1 ? 1 : 0.55,
                    transition: "opacity 600ms var(--ease)",
                  }}
                >
                  <div
                    className="serif"
                    style={{ fontSize: 19, fontStyle: "italic", color: "var(--ink)", letterSpacing: "0.005em" }}
                  >
                    {n.agent.name}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color: "var(--ink-3)",
                      textTransform: "uppercase",
                      marginTop: 4,
                    }}
                  >
                    {n.agent.role.replace(/_/g, " ")}
                  </div>
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
                </div>
              ))}
            </div>
          )}

          {!isError && phase === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
              <div
                className="serif"
                style={{
                  fontSize: 17,
                  fontStyle: "italic",
                  color: "var(--ink-1)",
                  lineHeight: 1.45,
                  marginBottom: 8,
                }}
              >
                A shape, in {endYear - startYear} years —
              </div>
              {outline.map((o, i) => {
                if (planArrivedAt === null) return null;
                const at = planArrivedAt + 600 + i * PLAN_REVEAL_MS;
                if (now < at) return null;
                return (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 14, alignItems: "baseline", animation: "fade-in 700ms var(--ease) both" }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-3)", minWidth: 38 }}
                    >
                      {o.year}
                    </span>
                    <span
                      className="serif"
                      style={{ fontStyle: "italic", color: "var(--ink-1)", fontSize: 16, lineHeight: 1.35 }}
                    >
                      {o.hint}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!isError && phase === 3 && active && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0, overflow: "hidden" }}>
              <div style={{ paddingBottom: 14, borderBottom: "1px solid var(--line-soft)" }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.22em",
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {active.year}
                  {activeAge !== null ? ` · age ${activeAge}` : ""}
                </div>
                <div className="serif" style={{ fontSize: 19, fontStyle: "italic", lineHeight: 1.35, color: "var(--ink)" }}>
                  {active.title || active.hint}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
                {visibleBubbles.map((b, j) => (
                  <div
                    key={`${activeIdx}-${j}`}
                    style={{ animation: "fade-in 600ms var(--ease) both" }}
                  >
                    <div
                      className="mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.22em",
                        color: b.who === "narrator" ? "var(--ink-3)" : "var(--accent)",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {b.who === "narrator" ? "—" : b.who}
                    </div>
                    <div
                      className="serif"
                      style={{
                        fontSize: 16,
                        lineHeight: 1.45,
                        color: b.who === "narrator" ? "var(--ink-2)" : "var(--ink)",
                        fontStyle: b.who === "narrator" ? "italic" : "normal",
                        letterSpacing: "0.003em",
                      }}
                    >
                      {b.who === "narrator" ? b.line : `"${b.line}"`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isError && phase === 4 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                animation: "fade-in 800ms var(--ease) both",
              }}
            >
              <div
                className="serif"
                style={{ fontSize: 19, fontStyle: "italic", color: "var(--ink-1)", lineHeight: 1.45 }}
              >
                {endYear - startYear} years, condensed into a voice you'll recognize.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Wave />
                <span className="meta" style={{ color: "var(--accent)" }}>
                  rendering monologue
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-3)" }}>
                {[
                  "selecting tone · weary, kind",
                  "pulling the four moments she keeps coming back to",
                  "choosing what to leave out",
                  "letting her be older than you remember being",
                ].map((s, i) => {
                  const at = 400 + i * 1500;
                  if (finalProgress * 4500 < at) return null;
                  return (
                    <div
                      key={i}
                      className="mono"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        animation: "fade-in 600ms var(--ease) both",
                      }}
                    >
                      › {s}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: "14px 40px 20px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-3)", textTransform: "uppercase" }}
        >
          {footnote}
        </span>
        {(simStreamPhase === "complete" || isError) && (
          <button className="under" onClick={onContinue}>
            meet {profile.name?.trim() ? "yourself" : "her"} →
          </button>
        )}
      </div>
    </div>
  );
}

interface YearAxisProps {
  from: number;
  to: number;
  outline: FilledOutline[];
  activeIdx: number;
  phase: number;
  now: number;
  planArrivedAt: number | null;
}

function YearAxis({ from, to, outline, activeIdx, phase, now, planArrivedAt }: YearAxisProps) {
  const span = Math.max(1, to - from);
  function pct(year: number) {
    return ((year - from) / span) * 100;
  }

  const activeYear = phase === 3 && activeIdx >= 0 ? outline[activeIdx]?.year : null;
  const ticks: number[] = [];
  const step = span >= 20 ? 5 : span >= 10 ? 2 : 1;
  for (let y = from; y <= to; y += step) ticks.push(y);
  if (ticks[ticks.length - 1] !== to) ticks.push(to);

  return (
    <div style={{ position: "relative", height: 80, padding: "26px 0 10px 0", userSelect: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 48,
          height: 1,
          background: "var(--line)",
        }}
      />

      {ticks.map((y) => {
        const collides = activeYear !== null && Math.abs(activeYear - y) <= 1;
        return (
          <div
            key={y}
            style={{ position: "absolute", left: pct(y) + "%", top: 44, transform: "translateX(-50%)" }}
          >
            <div style={{ width: 1, height: 9, background: "var(--ink-4)" }} />
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: "var(--ink-3)",
                letterSpacing: "0.18em",
                marginTop: 6,
                transform: "translateX(-50%)",
                position: "absolute",
                left: 0,
                opacity: collides ? 0 : 1,
                transition: "opacity 500ms var(--ease)",
              }}
            >
              {y}
            </div>
          </div>
        );
      })}

      {outline.map((o, i) => {
        if (planArrivedAt === null) return null;
        const at = planArrivedAt + 400 + i * 220;
        if (now < at) return null;

        const left = pct(o.year);
        const isActive = i === activeIdx && phase === 3;
        const isDone = o.filled && !isActive;
        const isGhost = !o.filled;
        const localT =
          isActive && o.filledAt !== undefined
            ? Math.max(0, Math.min(1, (now - o.filledAt) / EVENT_PULSE_MS))
            : 0;

        const color = isActive ? "var(--accent)" : isDone ? "var(--ink-1)" : "var(--ink-3)";
        const op = isGhost ? 0.45 : 1;
        const size = isActive ? 10 + (1 - localT) * 4 : isDone ? 7 : 6;

        return (
          <div
            key={`${o.year}-${i}`}
            style={{
              position: "absolute",
              left: left + "%",
              top: 48,
              transform: "translate(-50%, -50%)",
              opacity: op,
              transition: "opacity 800ms var(--ease)",
              animation: "fade-in 600ms var(--ease) both",
            }}
          >
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 36,
                  height: 36,
                  marginLeft: -18,
                  marginTop: -18,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, oklch(0.74 0.09 65 / 0.35), transparent 70%)",
                  animation: "breathe 1.6s ease-in-out infinite",
                }}
              />
            )}
            <div
              style={{
                width: size,
                height: size,
                transform: "rotate(45deg)",
                background: color,
                boxShadow: isActive ? "0 0 12px var(--accent)" : "none",
                transition: "background 800ms var(--ease)",
              }}
            />
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: -34,
                  transform: "translateX(-50%)",
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  animation: "fade-in 400ms var(--ease) both",
                }}
              >
                {o.year}
              </div>
            )}
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: pct(from) + "%",
          top: 14,
          transform: "translateX(-50%)",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 9,
            color: "var(--accent)",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          today
        </div>
      </div>
    </div>
  );
}

type RevealPhase = 0 | 1 | 2 | 3;

export function ScreenReveal({ onContinue, onJumpTo, profile, simulation }: ScreenProps) {
  const [phase, setPhase] = useState<RevealPhase>(0);
  const { voiceMode, clonedVoiceId } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 900);
    const t2 = setTimeout(() => setPhase(2), 3400);
    const t3 = setTimeout(() => setPhase(3), 5800);
    return () => {
      [t1, t2, t3].forEach(clearTimeout);
    };
  }, []);

  const opening = simulation?.futureSelfOpening ?? AE_DATA.futureSelfOpening;
  const streamed = useStreamedText(opening, 24, phase >= 3);

  // Auto-play the opening in the cloned voice (if available) when phase 3 hits.
  useEffect(() => {
    if (phase >= 3 && voiceMode && voicePrimed) {
      tts.play(opening, clonedVoiceId ?? undefined);
    }
    return () => tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceMode, voicePrimed, opening, clonedVoiceId]);

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Pinned overlays — Mark, corner label, button — never scroll */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 32,
          zIndex: 5,
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 1200ms var(--ease)",
          pointerEvents: phase >= 2 ? "auto" : "none",
        }}
      >
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      {/* Scroll container — content centers when it fits, scrolls when it doesn't */}
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 40px 140px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(420px, 32vw)",
              height: "min(56vh, 560px)",
              flexShrink: 0,
              opacity: phase >= 1 ? 1 : 0,
              transition: "opacity 2200ms var(--ease)",
            }}
          >
            {(() => {
              const p = nearestPortrait(simulation?.agedPortraits, "high", profile.targetYear);
              return <PortraitImage src={p?.imageUrl} alt={p ? `you at ${p.age}` : "you"} />;
            })()}
          </div>

          <div
            style={{
              marginTop: 36,
              textAlign: "center",
              opacity: phase >= 2 ? 1 : 0,
              transition: "opacity 1600ms var(--ease)",
            }}
          >
            <Meta style={{ marginBottom: 14 }}>
              {profile.name || "Sarah"} · {profile.targetYear || 2046}
            </Meta>
          </div>

          <div
            style={{
              maxWidth: 720,
              margin: "28px auto 0",
              textAlign: "center",
              minHeight: 130,
            }}
          >
            {phase >= 3 && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 22,
                  animation: "fade-in 700ms var(--ease) both",
                }}
              >
                <Wave />
                <span className="meta" style={{ color: "var(--accent)" }}>
                  future self speaking
                </span>
              </div>
            )}
            <p
              className="serif"
              style={{
                fontSize: "clamp(20px, 2.2vw, 26px)",
                lineHeight: 1.55,
                fontStyle: "italic",
                color: "var(--ink)",
                margin: 0,
                letterSpacing: "0.003em",
              }}
            >
              {streamed}
              {phase >= 3 && streamed.length < opening.length && (
                <span className="caret" style={{ height: 22 }}>
                  &nbsp;
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <button
        className="under"
        onClick={onContinue}
        style={{
          position: "absolute",
          bottom: 40,
          right: 40,
          zIndex: 5,
          opacity: streamed.length === opening.length ? 1 : 0,
          transition: "opacity 1000ms var(--ease)",
          pointerEvents: streamed.length === opening.length ? "auto" : "none",
        }}
      >
        See how it all unfolds →
      </button>
    </div>
  );
}
