import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerLabel,
  Mark,
  Meta,
  Portrait,
  clamp,
  pickPortraitAge,
  useStreamedText,
} from "../atoms";
import type { PortraitMood } from "../atoms";
import { AE_DATA } from "../data";
import type { Checkpoint, Profile } from "../types";

interface BaseProps {
  onContinue: () => void;
  profile: Profile;
}

interface EncoreProps {
  onRestart: () => void;
  profile: Profile;
}

interface ChatMessage {
  role: "user" | "future";
  text: string;
  done: boolean;
}

// ============ 05 CHAT ============
export function ScreenChat({ onContinue, profile }: BaseProps) {
  const olderAge =
    (Number(profile.age) || 32) +
    ((Number(profile.targetYear) - Number(profile.presentYear)) || 20);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "future", text: AE_DATA.futureSelfOpening, done: true },
  ]);
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null);
  const [input, setInput] = useState("");

  const replies = AE_DATA.futureSelfReplies;
  const suggestions = Object.keys(replies);

  const streaming = pending ? pending.answer : "";
  const streamed = useStreamedText(streaming, 22, !!pending, () => {
    if (!pending) return;
    setMessages((m) => [...m, { role: "future", text: pending.answer, done: true }]);
    setPending(null);
  });

  function ask(q: string) {
    if (pending) return;
    const reply =
      replies[q] ||
      "I'm not sure yet. The simulation only goes so deep on what you just asked. Try one of the others.";
    setMessages((m) => [...m, { role: "user", text: q, done: true }]);
    setTimeout(() => setPending({ question: q, answer: reply }), 700);
    setInput("");
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamed]);

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "minmax(280px, 380px) 1fr",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 32, left: 32, zIndex: 5 }}>
        <Mark />
      </div>
      <CornerLabel pos="tr">interview · {profile.targetYear || 2046}</CornerLabel>

      {/* Left: portrait column */}
      <div
        style={{
          borderRight: "1px solid var(--line-soft)",
          padding: "100px 32px 40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div style={{ width: "100%", height: 420, flexShrink: 0, maxWidth: 320 }}>
          <Portrait age={olderAge} mood="dim" />
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            className="serif"
            style={{
              fontSize: 22,
              color: "var(--ink)",
              letterSpacing: "0.005em",
              fontStyle: "italic",
            }}
          >
            {profile.name || "Sarah"}
          </div>
          <Meta style={{ marginTop: 8 }}>
            age {olderAge} · {profile.targetYear || 2046}
          </Meta>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--ink-3)" }}>
          <div
            className="wave"
            aria-hidden
            style={{ opacity: pending ? 1 : 0.25, transition: "opacity 500ms" }}
          >
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="meta">{pending ? "speaking" : "listening"}</span>
        </div>

        <div
          style={{
            marginTop: "auto",
            color: "var(--ink-3)",
            fontFamily: "var(--mono)",
            fontSize: 9,
            letterSpacing: "0.18em",
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          voice · elevenlabs
          <br />
          memory · 6 checkpoints
        </div>
      </div>

      {/* Right: conversation */}
      <div
        style={{ display: "flex", flexDirection: "column", height: "100%", padding: "100px 60px 32px" }}
      >
        <div ref={scrollRef} style={{ flex: 1, overflow: "auto", paddingRight: 8 }}>
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
            {messages.map((m, i) => (
              <Message key={i} m={m} />
            ))}
            {pending && (
              <div style={{ animation: "fade-in 500ms var(--ease) both" }}>
                <Meta style={{ marginBottom: 10, color: "var(--accent)" }}>future self</Meta>
                <p
                  className="serif"
                  style={{
                    fontSize: 22,
                    lineHeight: 1.55,
                    fontStyle: "italic",
                    color: "var(--ink)",
                    margin: 0,
                  }}
                >
                  {streamed}
                  <span className="caret" style={{ height: 18 }}>
                    &nbsp;
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Suggestion chips + input */}
        <div style={{ maxWidth: 700, margin: "32px auto 0", width: "100%" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 18,
              opacity: pending ? 0.4 : 1,
              transition: "opacity 400ms var(--ease)",
            }}
          >
            {suggestions.map((s) => (
              <button
                key={s}
                className="chip"
                disabled={!!pending}
                onClick={() => ask(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              borderTop: "1px solid var(--line)",
              paddingTop: 18,
            }}
          >
            <input
              className="field"
              style={{ borderBottom: "none", fontSize: 20, padding: "8px 0" }}
              placeholder="Ask her something else…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) ask(input.trim());
              }}
              disabled={!!pending}
            />
            <button className="under" onClick={onContinue}>
              see the years between →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div style={{ animation: "fade-in 500ms var(--ease) both", textAlign: "right" }}>
        <Meta style={{ marginBottom: 10, color: "var(--ink-2)" }}>you · today</Meta>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.5,
            color: "var(--ink-1)",
            margin: 0,
            letterSpacing: 0,
          }}
        >
          {m.text}
        </p>
      </div>
    );
  }
  return (
    <div style={{ animation: "fade-in 700ms var(--ease) both" }}>
      <Meta style={{ marginBottom: 10, color: "var(--accent)" }}>future self</Meta>
      <p
        className="serif"
        style={{
          fontSize: 22,
          lineHeight: 1.55,
          fontStyle: "italic",
          color: "var(--ink)",
          margin: 0,
        }}
      >
        {m.text}
      </p>
    </div>
  );
}

// ============ 06 TIMELINE ============
export function ScreenTimeline({ onContinue, profile }: BaseProps) {
  const checkpoints = AE_DATA.checkpointsHigh;
  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;
  const span = endYear - startYear;
  const baseAge = profile.age || 32;

  const [t, setT] = useState(0);
  const currentYear = Math.round(startYear + t * span);
  const currentAge = baseAge + (currentYear - startYear);

  const activeIdx = useMemo(() => {
    let last = -1;
    checkpoints.forEach((c, i) => {
      if (c.year <= currentYear) last = i;
    });
    return last;
  }, [currentYear, checkpoints]);

  const mood: PortraitMood = currentYear < 2032 ? "neutral" : "dim";

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        display: "grid",
        gridTemplateColumns: "minmax(320px, 420px) 1fr",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 32, left: 32, zIndex: 5 }}>
        <Mark />
      </div>
      <CornerLabel pos="tr">timeline · drag to scrub</CornerLabel>

      {/* portrait pane */}
      <div
        style={{
          borderRight: "1px solid var(--line-soft)",
          padding: "100px 32px 200px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "min(58vh, 480px)",
            flexShrink: 0,
            maxWidth: 360,
            transition: "filter 600ms var(--ease)",
          }}
        >
          <Portrait age={currentAge} mood={mood} fadeKey={pickPortraitAge(currentAge)} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            className="serif"
            style={{
              fontSize: 26,
              fontStyle: "italic",
              color: "var(--ink)",
              letterSpacing: "0.005em",
            }}
          >
            {currentYear}
          </div>
          <Meta style={{ marginTop: 6 }}>
            {profile.name || "Sarah"} · age {currentAge}
          </Meta>
        </div>
      </div>

      {/* checkpoint pane */}
      <div style={{ padding: "100px 60px 200px", overflow: "auto" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Meta style={{ marginBottom: 18 }}>the years up to {currentYear}</Meta>
          <h2
            className="serif"
            style={{
              fontSize: 36,
              fontWeight: 400,
              fontStyle: "italic",
              margin: 0,
              marginBottom: 38,
              lineHeight: 1.2,
              color: "var(--ink)",
            }}
          >
            What happens, if nothing changes.
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {checkpoints.map((c, i) => (
              <CheckpointCard
                key={c.year}
                c={c}
                active={i === activeIdx}
                visible={c.year <= currentYear}
              />
            ))}
          </div>
        </div>
      </div>

      {/* timeline scrubber */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "32px 60px 36px",
          borderTop: "1px solid var(--line-soft)",
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.4) 30%)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <Meta>
            scrub · {startYear} → {endYear}
          </Meta>
          <button className="under" onClick={onContinue}>
            change one thing →
          </button>
        </div>
        <input
          type="range"
          className="fancy"
          min={0}
          max={1000}
          value={t * 1000}
          onChange={(e) => setT(Number(e.target.value) / 1000)}
          style={{ width: "100%" }}
        />
        <div className="ticks">
          {Array.from({ length: span + 1 }).map((_, i) => {
            const y = startYear + i;
            const isMajor = i % 5 === 0 || i === span;
            return (
              <span
                key={y}
                className={isMajor ? "major" : ""}
                style={{ left: `${(i / span) * 100}%` }}
              />
            );
          })}
          {Array.from({ length: Math.floor(span / 5) + 1 }).map((_, i) => {
            const y = startYear + i * 5;
            return (
              <label key={y} style={{ left: `${((y - startYear) / span) * 100}%` }}>
                {y}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CheckpointCard({
  c,
  active,
  visible,
}: {
  c: Checkpoint;
  active: boolean;
  visible: boolean;
}) {
  const tone =
    c.tone === "warn" ? "var(--warn)" : c.tone === "good" ? "var(--accent)" : "var(--ink-2)";
  return (
    <div
      className="card"
      style={{
        opacity: visible ? 1 : 0.18,
        borderColor: active ? "var(--accent-line)" : undefined,
        transform: active ? "translateX(8px)" : "translateX(0)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <span className="year">
          {c.year} · age {c.age}
        </span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: tone,
            opacity: 0.6,
          }}
        />
      </div>
      <h3
        className="serif"
        style={{
          fontSize: 22,
          fontWeight: 400,
          fontStyle: "italic",
          margin: 0,
          marginBottom: 14,
          color: "var(--ink)",
          lineHeight: 1.3,
        }}
      >
        {c.title}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "8px 18px",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink-1)",
        }}
      >
        <div className="meta" style={{ marginTop: 3 }}>
          event
        </div>
        <div>{c.event}</div>
        <div className="meta" style={{ marginTop: 3 }}>
          did
        </div>
        <div>{c.did}</div>
        <div className="meta" style={{ marginTop: 3 }}>
          then
        </div>
        <div className="serif" style={{ fontStyle: "italic", color: "var(--ink)", fontSize: 17 }}>
          {c.consequence}
        </div>
      </div>
    </div>
  );
}

// ============ 07 SLIDER ============
export function ScreenSlider({ onContinue, profile }: BaseProps) {
  const [hours, setHours] = useState(profile.workHours || 65);
  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;
  const baseAge = profile.age || 32;

  const isLow = hours <= 50;
  const checkpoints = isLow ? AE_DATA.checkpointsLow : AE_DATA.checkpointsHigh;
  const finalCp = checkpoints[checkpoints.length - 1];
  const finalAge = baseAge + (endYear - startYear);

  const opt = clamp(1 - (hours - 30) / 60, 0.12, 0.92);

  const mood: PortraitMood = isLow ? "warm" : "dim";

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        display: "grid",
        gridTemplateColumns: "minmax(360px, 460px) 1fr",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 32, left: 32, zIndex: 5 }}>
        <Mark />
      </div>
      <CornerLabel pos="tr">re-simulate · one variable</CornerLabel>

      {/* portrait at target year */}
      <div
        style={{
          borderRight: "1px solid var(--line-soft)",
          padding: "100px 32px 240px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "min(56vh, 500px)",
            flexShrink: 0,
            maxWidth: 380,
            transition: "filter 700ms var(--ease)",
          }}
        >
          <Portrait age={finalAge} mood={mood} fadeKey={isLow ? "low" : "high"} />
        </div>
        <div style={{ textAlign: "center", transition: "color 600ms var(--ease)" }}>
          <Meta style={{ marginBottom: 8, color: isLow ? "var(--accent)" : "var(--ink-3)" }}>
            {endYear} · age {finalAge}
          </Meta>
          <div
            className="serif"
            style={{
              fontSize: 22,
              fontStyle: "italic",
              color: "var(--ink-1)",
              maxWidth: 320,
              margin: "0 auto",
              lineHeight: 1.4,
            }}
          >
            “{finalCp.consequence}”
          </div>
        </div>
      </div>

      {/* trajectory + slider */}
      <div style={{ padding: "100px 60px 280px", overflow: "auto" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Meta style={{ marginBottom: 16 }}>change one thing</Meta>
          <h2
            className="serif"
            style={{
              fontSize: 40,
              fontWeight: 400,
              fontStyle: "italic",
              margin: 0,
              marginBottom: 6,
              lineHeight: 1.15,
              color: "var(--ink)",
            }}
          >
            What if you worked
          </h2>
          <h2
            className="serif"
            style={{
              fontSize: 40,
              fontWeight: 400,
              fontStyle: "italic",
              margin: 0,
              marginBottom: 44,
              lineHeight: 1.15,
              color: "var(--ink)",
            }}
          >
            <span style={{ color: "var(--accent)", transition: "color 500ms" }}>
              {hours} hours
            </span>{" "}
            a week instead?
          </h2>

          <div style={{ marginBottom: 56 }}>
            <input
              type="range"
              className="fancy accent"
              min={30}
              max={80}
              step={1}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <Meta>30 hrs</Meta>
              <Meta>80 hrs</Meta>
            </div>
          </div>

          {/* optimistic path indicator */}
          <div style={{ marginBottom: 48 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 14,
              }}
            >
              <Meta>optimistic path probability</Meta>
              <span
                className="mono"
                style={{
                  fontSize: 16,
                  color: isLow ? "var(--accent)" : "var(--ink-1)",
                  letterSpacing: "0.1em",
                  transition: "color 500ms",
                }}
              >
                {Math.round(opt * 100)}%
              </span>
            </div>
            <div style={{ position: "relative", height: 1, background: "var(--line)" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: 1,
                  width: `${opt * 100}%`,
                  background: isLow ? "var(--accent)" : "var(--ink-2)",
                  transition: "width 700ms var(--ease), background 500ms var(--ease)",
                }}
              />
            </div>
          </div>

          {/* a single rewriting checkpoint card to demonstrate live re-sim */}
          <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 32 }}>
            <Meta style={{ marginBottom: 18 }}>a representative year · {checkpoints[2].year}</Meta>
            <CheckpointCard c={checkpoints[2]} active visible />
          </div>
        </div>
      </div>

      {/* bottom continue */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "20px 60px 28px",
          borderTop: "1px solid var(--line-soft)",
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.5))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Meta>{isLow ? "the alternate path" : "the path you're on"}</Meta>
        <button className="under" onClick={onContinue}>
          see them side by side →
        </button>
      </div>
    </div>
  );
}

// ============ 08 ENCORE ============
export function ScreenEncore({ onRestart, profile }: EncoreProps) {
  const baseAge = profile.age || 32;
  const finalAge = baseAge + ((profile.targetYear || 2046) - (profile.presentYear || 2026));
  const high = AE_DATA.checkpointsHigh[AE_DATA.checkpointsHigh.length - 1];
  const low = AE_DATA.checkpointsLow[AE_DATA.checkpointsLow.length - 1];

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "80px 60px 60px",
      }}
    >
      <div style={{ position: "absolute", top: 32, left: 32 }}>
        <Mark />
      </div>
      <CornerLabel pos="tr">two futures · {profile.targetYear || 2046}</CornerLabel>

      <div
        style={{
          textAlign: "center",
          marginBottom: 54,
          animation: "fade-in 800ms var(--ease) both",
        }}
      >
        <Meta style={{ marginBottom: 14 }}>
          {profile.name || "Sarah"} · age {finalAge}
        </Meta>
        <h2
          className="serif"
          style={{
            fontSize: 44,
            fontWeight: 400,
            fontStyle: "italic",
            margin: 0,
            lineHeight: 1.15,
            color: "var(--ink)",
            letterSpacing: "0.005em",
          }}
        >
          The same person, twice.
        </h2>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          gap: 60,
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
          alignItems: "stretch",
        }}
      >
        <FutureColumn
          label="if nothing changes · 65 hrs"
          portraitMood="dim"
          age={finalAge}
          cp={high}
          accent={false}
          fadeKey="enc-high"
        />
        <div style={{ background: "var(--line-soft)" }} />
        <FutureColumn
          label="at 45 hrs"
          portraitMood="warm"
          age={finalAge}
          cp={low}
          accent
          fadeKey="enc-low"
        />
      </div>

      <div
        style={{
          borderTop: "1px solid var(--line-soft)",
          marginTop: 50,
          paddingTop: 32,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button className="under" onClick={onRestart}>
          ← simulate again
        </button>
        <div
          className="serif"
          style={{
            fontStyle: "italic",
            color: "var(--ink-2)",
            fontSize: 17,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          “{AE_DATA.futureSelfReplies["What should I change?"].split(".")[0]}.”
        </div>
        <button className="btn">Save · share quietly</button>
      </div>
    </div>
  );
}

function FutureColumn({
  label,
  portraitMood,
  age,
  cp,
  accent,
  fadeKey,
}: {
  label: string;
  portraitMood: PortraitMood;
  age: number;
  cp: Checkpoint;
  accent: boolean;
  fadeKey: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        animation: "fade-in 1000ms var(--ease) 200ms both",
      }}
    >
      <Meta style={{ marginBottom: 18, color: accent ? "var(--accent)" : "var(--ink-3)" }}>
        {label}
      </Meta>
      <div style={{ width: "100%", height: "min(50vh, 460px)", flexShrink: 0, marginBottom: 24 }}>
        <Portrait age={age} mood={portraitMood} fadeKey={fadeKey} />
      </div>
      <h3
        className="serif"
        style={{
          fontSize: 24,
          fontWeight: 400,
          fontStyle: "italic",
          margin: 0,
          marginBottom: 16,
          lineHeight: 1.3,
          color: "var(--ink)",
        }}
      >
        {cp.title}
      </h3>
      <p
        className="serif"
        style={{
          fontSize: 17,
          lineHeight: 1.6,
          color: "var(--ink-1)",
          margin: 0,
          fontStyle: "italic",
        }}
      >
        {cp.consequence}
      </p>
    </div>
  );
}
