import { useEffect, useState } from "react";
import type { ScreenProps } from "../App";
import { CornerLabel, Mark, Meta, Portrait, Wave, useStreamedText } from "../atoms";
import { AE_DATA } from "../data";
import type { Profile } from "../types";

export function ScreenLanding({ onContinue }: ScreenProps) {
  return (
    <div
      className="screen-inner"
      style={{ height: "100%", position: "relative", display: "flex", flexDirection: "column" }}
    >
      <div style={{ position: "absolute", top: 32, left: 32 }}>
        <Mark />
      </div>
      <CornerLabel pos="tr">v 0.3 · simulation build</CornerLabel>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 40px",
          animation: "fade-in 1100ms var(--ease) 200ms both",
        }}
      >
        <Meta style={{ marginBottom: 28 }}>a personal future simulation</Meta>
        <h1
          className="serif"
          style={{
            fontSize: "clamp(56px, 8vw, 112px)",
            fontWeight: 400,
            lineHeight: 1.05,
            textAlign: "center",
            margin: 0,
            letterSpacing: "-0.01em",
            maxWidth: 1100,
          }}
        >
          See where your life
          <br />
          is heading.
        </h1>

        <div style={{ height: 120 }} />

        <button
          className="btn btn-accent"
          onClick={onContinue}
          style={{ animation: "fade-in 900ms var(--ease) 1100ms both" }}
        >
          Upload a selfie
        </button>
        <div
          className="muted"
          style={{
            fontSize: 12,
            marginTop: 18,
            fontFamily: "var(--mono)",
            letterSpacing: "0.14em",
            animation: "fade-in 900ms var(--ease) 1500ms both",
          }}
        >
          ~ 8 minutes · honest, not motivational
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          animation: "fade-in 1200ms var(--ease) 1800ms both",
        }}
      >
        <div
          className="serif"
          style={{
            fontStyle: "italic",
            color: "var(--ink-3)",
            fontSize: 15,
            letterSpacing: "0.02em",
          }}
        >
          Not an oracle. A mirror with a long view.
        </div>
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
    label: "How far should I look ahead?",
    placeholder: "2046",
    type: "number",
    suffix: "Twenty years from now feels right.",
  },
];

export function ScreenIntake({ onContinue, profile, setProfile }: ScreenProps) {
  const [step, setStep] = useState(0);
  const cur = INTAKE_FIELDS[step];

  function next() {
    if (step < INTAKE_FIELDS.length - 1) setStep(step + 1);
    else onContinue();
  }

  const value = profile[cur.key];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", top: 32, left: 32 }}>
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
              onChange={(e) =>
                setProfile({
                  ...profile,
                  [cur.key]:
                    cur.type === "number" ? Number(e.target.value) : e.target.value,
                })
              }
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

const PROCESSING_LINES = [
  "Reading what you wrote.",
  "Drafting the people in your life.",
  "Pulling the news of the years between.",
  "Imagining a Tuesday afternoon in 2034.",
  "Listening to who you'll become.",
  "Letting your future self get older.",
];

export function ScreenProcessing({ onContinue }: ScreenProps) {
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setLineIdx((i) => (i + 1) % PROCESSING_LINES.length);
    }, 3200);
    const finish = setTimeout(onContinue, 9500);
    return () => {
      clearInterval(t);
      clearTimeout(finish);
    };
  }, [onContinue]);

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
      <div style={{ position: "absolute", top: 32, left: 32 }}>
        <Mark />
      </div>
      <CornerLabel pos="tr">simulating · do not refresh</CornerLabel>

      <svg
        width="640"
        height="640"
        viewBox="0 0 640 640"
        style={{
          position: "absolute",
          opacity: 0.15,
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
            opacity={0.6 - i * 0.1}
          />
        ))}
      </svg>

      <div className="sweep" />

      <div style={{ position: "relative", textAlign: "center", maxWidth: 720, padding: "0 40px" }}>
        <Meta style={{ marginBottom: 28 }}>
          processing · {Math.round(((lineIdx + 1) / PROCESSING_LINES.length) * 100)}%
        </Meta>
        <div
          key={lineIdx}
          className="serif"
          style={{
            fontSize: "clamp(28px, 4vw, 44px)",
            lineHeight: 1.3,
            fontStyle: "italic",
            letterSpacing: "0.005em",
            color: "var(--ink)",
            minHeight: 120,
            animation: "fade-in-slow 1800ms var(--ease) both",
          }}
        >
          {PROCESSING_LINES[lineIdx]}
        </div>

        <div style={{ marginTop: 60, display: "flex", justifyContent: "center", gap: 4 }}>
          {PROCESSING_LINES.map((_, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 1,
                background: i === lineIdx ? "var(--accent)" : "var(--ink-4)",
                transition: "background 600ms var(--ease)",
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 36,
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--ink-3)",
        }}
      >
        avg 47s · this one is yours
      </div>
    </div>
  );
}

type RevealPhase = 0 | 1 | 2 | 3;

export function ScreenReveal({ onContinue, profile }: ScreenProps) {
  const [phase, setPhase] = useState<RevealPhase>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 900);
    const t2 = setTimeout(() => setPhase(2), 3400);
    const t3 = setTimeout(() => setPhase(3), 5800);
    return () => {
      [t1, t2, t3].forEach(clearTimeout);
    };
  }, []);

  const opening = AE_DATA.futureSelfOpening;
  const streamed = useStreamedText(opening, 24, phase >= 3);

  const olderAge =
    (Number(profile.age) || 32) +
    ((Number(profile.targetYear) - Number(profile.presentYear)) || 20);

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 32,
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 1200ms var(--ease)",
        }}
      >
        <Mark />
      </div>
      <CornerLabel pos="tr">
        {profile.targetYear} · age {olderAge}
      </CornerLabel>

      <div
        style={{
          width: "min(420px, 32vw)",
          height: "min(56vh, 560px)",
          flexShrink: 0,
          opacity: phase >= 1 ? 1 : 0,
          transition: "opacity 2200ms var(--ease)",
          marginTop: 20,
        }}
      >
        <Portrait age={olderAge} mood="dim" />
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
          padding: "0 40px",
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

      <button
        className="under"
        onClick={onContinue}
        style={{
          position: "absolute",
          bottom: 40,
          right: 40,
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
