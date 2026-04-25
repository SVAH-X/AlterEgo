import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { ScreenProps } from "../App";
import { CornerLabel, Mark, Meta, Portrait, Wave, useStreamedText } from "../atoms";
import { AE_DATA } from "../data";
import { simulateStream } from "../lib/api";
import type { Profile } from "../types";
import romanStatue from "../assets/roman-half-blur.png";
import darkClouds from "../assets/dark-grey-clouds-over-the-ocean.jpg";

export function ScreenLanding({ onContinue, setSelfieUploaded }: ScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    // We never read or store the file — we only remember that one was given.
    // The future image-gen pipeline will own the actual upload.
    if (e.target.files && e.target.files.length > 0) {
      setSelfieUploaded(true);
      onContinue();
    }
  }

  function skip() {
    setSelfieUploaded(false);
    onContinue();
  }

  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="mark-anchor">
        <Mark />
      </div>
      <CornerLabel pos="tr">v 0.3 · simulation build</CornerLabel>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      {/* Whole hero is the upload target — click anywhere to pick a file. */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Upload a selfie to begin"
        style={{
          all: "unset",
          cursor: "pointer",
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)",
          alignItems: "center",
          padding: "100px clamp(56px, 6vw, 96px) 140px",
          gap: "clamp(32px, 4vw, 72px)",
          boxSizing: "border-box",
          animation: "fade-in 1100ms var(--ease) 200ms both",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 56,
          }}
        >
          <h1
            aria-label="Alter Ego"
            className="serif"
            style={{
              fontSize: "clamp(140px, 19vw, 280px)",
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
            Click anywhere to upload a selfie
            <br />
            <span style={{ color: "var(--accent)" }}>see where your life is heading</span>
          </div>
        </div>

        <div
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

      {/* Skip — pinned bottom-left, stops the hero click from firing. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        className="landing-skip"
        style={{
          position: "absolute",
          bottom: 28,
          left: 40,
          zIndex: 6,
          animation: "fade-in 900ms var(--ease) 1900ms both",
        }}
      >
        skip · proceed without a photo →
      </button>

      <div
        style={{
          position: "absolute",
          bottom: 32,
          right: 40,
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          animation: "fade-in 900ms var(--ease) 1900ms both",
        }}
      >
        ~ 8 min · honest, not motivational
      </div>
    </div>
  );
}

type IntakeField =
  | { key: keyof Profile; label: string; placeholder: string; type: "text" | "textarea"; suffix?: string }
  | { key: keyof Profile; label: string; placeholder: string; type: "number"; suffix?: string };

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
    key: "targetYear",
    label: "How many years should I look ahead?",
    placeholder: "20",
    type: "number",
    suffix: "Twenty feels right. Five if you want it close. Thirty if you want to see far.",
  },
];

export function ScreenIntake({ onContinue, profile, setProfile }: ScreenProps) {
  const [step, setStep] = useState(0);
  const cur = INTAKE_FIELDS[step];

  function next() {
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

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="mark-anchor">
        <Mark />
      </div>
      <CornerLabel pos="tr">
        intake · {String(step + 1).padStart(2, "0")} /{" "}
        {String(INTAKE_FIELDS.length).padStart(2, "0")}
      </CornerLabel>

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
              className="field"
              rows={2}
              autoFocus
              placeholder={cur.placeholder}
              value={(value as string | undefined) ?? ""}
              onChange={(e) => setProfile({ ...profile, [cur.key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) next();
              }}
            />
          ) : (
            <input
              className="field"
              autoFocus
              type={cur.type}
              placeholder={cur.placeholder}
              value={(value as string | number | undefined) ?? ""}
              onChange={(e) => {
                if (isYearsAheadField) {
                  const yrs = Number(e.target.value);
                  setProfile({
                    ...profile,
                    targetYear: profile.presentYear + (Number.isFinite(yrs) ? yrs : 0),
                  });
                } else {
                  setProfile({
                    ...profile,
                    [cur.key]:
                      cur.type === "number" ? Number(e.target.value) : e.target.value,
                  });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") next();
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

type Phase = "counting" | "plan" | "events" | "finalizing" | "complete" | "error";

interface FilledOutline {
  year: number;
  severity: number;
  hint: string;
  filled: boolean;       // becomes true once detail-fill lands
  pulse: number;         // monotonic counter to retrigger the pulse animation
  title?: string;
}

const PHASE_LABELS: Record<Phase, string> = {
  counting: "drafting the people in your life",
  plan: "laying out the years",
  events: "writing the moments",
  finalizing: "stitching it together",
  complete: "ready",
  error: "the simulation faltered",
};

export function ScreenProcessing({
  onContinue,
  profile,
  setSimulation,
}: ScreenProps) {
  const [phase, setPhase] = useState<Phase>("counting");
  const [agentCount, setAgentCount] = useState(0);
  const [outline, setOutline] = useState<FilledOutline[]>([]);
  const [latestTitle, setLatestTitle] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;
  const span = Math.max(1, endYear - startYear);

  // Continuous ticker so the line draws naturally even between events.
  // 100ms is fast enough that spot-reveal feels in-sync with the drawn line.
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, []);

  // The leading edge advances by whichever is further along: a steady
  // time-based estimate, or the latest event that's actually landed.
  // Both are capped below 1.0 — only `phase === "complete"` allows 100%,
  // so the user never sees the bar look "done" while finalize is still running.
  const ESTIMATED_TOTAL_MS = 70_000;
  const RUN_CAP = 0.85;       // ceiling during counting/plan/events
  const FINAL_CAP = 0.97;     // ceiling during finalize phase

  const timeFrac = Math.min(RUN_CAP, elapsedMs / ESTIMATED_TOTAL_MS);
  const latestFilledYear = outline.reduce(
    (acc, o) => (o.filled && o.year > acc ? o.year : acc),
    -1,
  );
  const eventFrac =
    latestFilledYear > 0
      ? Math.min(RUN_CAP, (latestFilledYear - startYear) / span)
      : 0;

  // During the finalize phase (after all events have landed) the bar continues
  // to crawl forward to FINAL_CAP so the screen doesn't appear stuck.
  const finalizingStartRef = useRef<number | null>(null);
  if (phase === "finalizing" && finalizingStartRef.current === null) {
    finalizingStartRef.current = Date.now();
  }
  const finalizeElapsed =
    finalizingStartRef.current !== null
      ? Date.now() - finalizingStartRef.current
      : 0;
  const FINALIZE_EXPECTED_MS = 18_000;
  const finalizeFrac =
    phase === "finalizing"
      ? RUN_CAP +
      Math.min(1, finalizeElapsed / FINALIZE_EXPECTED_MS) * (FINAL_CAP - RUN_CAP)
      : 0;

  const markerFrac =
    phase === "complete"
      ? 1
      : Math.max(timeFrac, eventFrac, finalizeFrac);

  useEffect(() => {
    let cancelled = false;
    let advanceTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const startedAt = Date.now();
      const MIN_MS = 5000;
      try {
        for await (const ev of simulateStream(profile)) {
          if (cancelled) return;
          if (ev.phase === "counting") {
            setAgentCount(ev.agents.length);
            setPhase("plan"); // counting done — moving on to planning
          } else if (ev.phase === "plan") {
            setOutline(
              ev.outline.map((o) => ({
                year: o.year,
                severity: o.severity,
                hint: o.hint,
                filled: false,
                pulse: 0,
              })),
            );
            setPhase("events");
          } else if (ev.phase === "event") {
            const cp = ev.checkpoint;
            setOutline((prev) => {
              const next = prev.map((o) => ({ ...o }));
              const idx =
                ev.index >= 0 && ev.index < next.length
                  ? ev.index
                  : next.findIndex((o) => o.year === cp.year && !o.filled);
              if (idx >= 0 && idx < next.length) {
                next[idx] = {
                  ...next[idx],
                  filled: true,
                  pulse: next[idx].pulse + 1,
                  title: cp.title,
                };
              }
              return next;
            });
            setLatestTitle(cp.title);
          } else if (ev.phase === "finalizing") {
            setPhase("finalizing");
            setLatestTitle("weaving the threads — the alternate path, the voice");
          } else if (ev.phase === "complete") {
            setSimulation(ev.simulation);
            setPhase("complete");
          } else if (ev.phase === "error") {
            console.error("simulate stream error:", ev.message);
            setErrorMsg(ev.message);
            setUsedFallback(true);
            setSimulation(null);
            setPhase("error");
          }
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("stream failed:", msg);
        setErrorMsg(msg);
        setUsedFallback(true);
        setSimulation(null);
        setPhase("error");
      }
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_MS - elapsed);
      // Hold just enough for the 900ms fill animation to play, plus a brief
      // beat. The user can also click "meet her →" to advance immediately.
      advanceTimer = setTimeout(() => {
        if (!cancelled) onContinue();
      }, Math.max(remaining, 1200));
    })();

    return () => {
      cancelled = true;
      if (advanceTimer) clearTimeout(advanceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filledCount = outline.filter((o) => o.filled).length;
  const totalEvents = outline.length;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="mark-anchor">
        <Mark />
      </div>
      <CornerLabel pos="tr">
        simulating · {phase === "complete" ? "ready" : "do not refresh"}
      </CornerLabel>

      <svg
        width="640"
        height="640"
        viewBox="0 0 640 640"
        style={{
          position: "absolute",
          opacity: 0.12,
          animation: "breathe 7s ease-in-out infinite",
        }}
      >
        {[80, 140, 200, 260, 320].map((r, i) => (
          <circle
            key={i}
            cx="320"
            cy="320"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="0.5"
            opacity={0.5 - i * 0.08}
          />
        ))}
      </svg>

      {/* Centerpiece — phase label + latest title */}
      <div
        style={{
          position: "relative",
          textAlign: "center",
          maxWidth: 820,
          padding: "0 40px",
          marginBottom: 60,
        }}
      >
        <Meta style={{ marginBottom: 24, color: phase === "error" ? "var(--warn)" : undefined }}>
          {PHASE_LABELS[phase]}
          {phase === "events" && totalEvents > 0
            ? ` · ${filledCount} / ${totalEvents}`
            : ""}
          {phase === "counting" && agentCount > 0 ? ` · ${agentCount} people` : ""}
        </Meta>
        <div
          key={latestTitle || phase}
          className="serif"
          style={{
            fontSize: "clamp(26px, 3.4vw, 40px)",
            lineHeight: 1.3,
            fontStyle: "italic",
            letterSpacing: "0.005em",
            color: "var(--ink)",
            minHeight: 100,
            animation: "fade-in-slow 1400ms var(--ease) both",
          }}
        >
          {latestTitle || (phase === "error" ? "Falling back to a sample." : "…")}
        </div>
      </div>

      {/* Progress bar — fills as events land, completes visibly before advancing */}
      <div
        style={{
          position: "relative",
          width: "min(900px, 88vw)",
          padding: "0 16px 60px",
        }}
      >
        {/* Year endpoints */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--ink-4)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            marginBottom: 18,
          }}
        >
          <span>{startYear}</span>
          <span>{endYear}</span>
        </div>

        {/* Track — actual bar, 5px tall with rounded ends */}
        <div
          style={{
            position: "relative",
            height: 5,
            width: "100%",
            background: "rgba(255, 255, 255, 0.06)",
            borderRadius: 4,
            overflow: "visible",
          }}
        >
          {/* Filled portion */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${markerFrac * 100}%`,
              background: "var(--accent)",
              borderRadius: 4,
              transition:
                phase === "complete"
                  ? "width 900ms cubic-bezier(0.22, 0.61, 0.36, 1)"
                  : "width 360ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              boxShadow: "0 0 10px rgba(212, 165, 116, 0.35)",
            }}
          />

          {/* Spots — only render once the bar has filled past their year */}
          {outline.map((o, i) => {
            const eventFrac = (o.year - startYear) / span;
            if (markerFrac < eventFrac) return null;
            const left = eventFrac * 100;
            return (
              <div
                key={`spot-${o.year}-${i}`}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: "var(--ink)",
                  boxShadow:
                    "0 0 4px 1px rgba(255, 255, 255, 0.6), 0 0 10px 3px rgba(212, 165, 116, 0.45)",
                  animation: "pulse-pin 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
                }}
              />
            );
          })}

          {/* Soft tip glow at the leading edge — fades out at completion */}
          <div
            style={{
              position: "absolute",
              left: `${markerFrac * 100}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow:
                "0 0 10px 3px rgba(212, 165, 116, 0.6), 0 0 22px 8px rgba(212, 165, 116, 0.18)",
              filter: "blur(0.5px)",
              transition:
                phase === "complete"
                  ? "left 900ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 600ms ease-out 700ms"
                  : "left 360ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              opacity: phase === "complete" ? 0 : 0.95,
            }}
          />
        </div>

        {/* Percent caption — gives the eye an explicit progress marker */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 14,
            color: "var(--ink-3)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
          }}
        >
          {Math.round(markerFrac * 100)}%
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 32,
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--ink-3)",
          textAlign: "center",
          maxWidth: 600,
        }}
      >
        {phase === "error"
          ? `${errorMsg?.slice(0, 80) ?? "stream interrupted"} · using sample`
          : usedFallback
            ? "showing a sample · your version is still cooking"
            : `${totalEvents > 0 ? totalEvents : "—"} events · ${agentCount > 0 ? agentCount : "—"} people`}
      </div>

      {(phase === "complete" || phase === "error") && (
        <button
          className="under"
          onClick={onContinue}
          style={{
            position: "absolute",
            bottom: 32,
            right: 40,
            animation: "fade-in 600ms var(--ease) both",
          }}
        >
          meet {profile.name?.trim() ? "yourself" : "her"} →
        </button>
      )}
    </div>
  );
}

type RevealPhase = 0 | 1 | 2 | 3;

export function ScreenReveal({ onContinue, profile, simulation, selfieUploaded }: ScreenProps) {
  const [phase, setPhase] = useState<RevealPhase>(0);
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

  const olderAge =
    (Number(profile.age) || 32) +
    ((Number(profile.targetYear) - Number(profile.presentYear)) || 20);

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
        <Mark />
      </div>
      <CornerLabel pos="tr">
        {profile.targetYear} · age {olderAge}
      </CornerLabel>

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
            <Portrait age={olderAge} mood="dim" blurred={!selfieUploaded} />
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
        ask her something →
      </button>
    </div>
  );
}
