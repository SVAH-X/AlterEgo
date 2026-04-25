import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenProps } from "../App";
import {
  CornerLabel,
  Mark,
  Meta,
  Portrait,
  Wave,
  clamp,
  pickPortraitAge,
  useStreamedText,
} from "../atoms";
import type { PortraitMood } from "../atoms";
import { AE_DATA } from "../data";
import { chat, simulateBranchStream } from "../lib/api";
import { nearestPortrait } from "../lib/portraits";
import type { AgedPortrait, Checkpoint, Tone, Trajectory } from "../types";

const TONE_COLOR: Record<Tone, string> = {
  warn: "var(--warn)",
  good: "var(--accent)",
  neutral: "var(--ink-2)",
};

interface ChatMessage {
  role: "user" | "future";
  text: string;
  done: boolean;
}

export function ScreenChat({ onContinue, profile, simulation }: ScreenProps) {
  const olderAge =
    (Number(profile.age) || 32) +
    ((Number(profile.targetYear) - Number(profile.presentYear)) || 20);

  const opening = simulation?.futureSelfOpening ?? AE_DATA.futureSelfOpening;
  const replies = simulation?.futureSelfReplies ?? AE_DATA.futureSelfReplies;
  const suggestions = Object.keys(replies);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "future", text: opening, done: true },
  ]);
  const [pending, setPending] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");

  const streamed = useStreamedText(pending ?? "", 22, !!pending, () => {
    if (!pending) return;
    setMessages((m) => [...m, { role: "future", text: pending, done: true }]);
    setPending(null);
  });

  const askTimer = useRef<ReturnType<typeof setTimeout>>();
  async function ask(q: string) {
    if (pending || thinking) return;
    const userMsg: ChatMessage = { role: "user", text: q, done: true };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    if (replies[q]) {
      askTimer.current = setTimeout(() => setPending(replies[q]), 700);
      return;
    }

    setThinking(true);
    let answer: string;
    try {
      // If the live simulation didn't land, fall back to AE_DATA so the
      // future self can still answer rather than deflecting.
      const sim = simulation ?? AE_DATA;
      const history = nextMessages
        .filter((m) => m.done)
        .map((m) => ({ role: m.role, text: m.text }));
      answer = await chat(profile, sim, history, q);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("chat failed:", msg);
      answer = "I can't reach myself right now. Try again in a moment.";
    } finally {
      setThinking(false);
    }
    setPending(answer);
  }
  useEffect(() => () => { if (askTimer.current) clearTimeout(askTimer.current); }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Track whether the user is near the bottom. If they've scrolled up to read,
  // we stop auto-scrolling so streaming text doesn't yank them back.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = dist < 60; // within 60px of bottom counts as "at bottom"
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return; // user has scrolled away — leave them alone
    el.scrollTop = el.scrollHeight;
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
          {(() => {
            const p = nearestPortrait(simulation?.agedPortraits, "high", profile.targetYear);
            if (p?.imageUrl) {
              return (
                <img
                  src={p.imageUrl}
                  alt={`you at ${p.age}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
                />
              );
            }
            return <Portrait age={olderAge} mood="dim" />;
          })()}
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
          <Wave style={{ opacity: pending || thinking ? 1 : 0.25, transition: "opacity 500ms" }} />
          <span className="meta">{thinking ? "thinking" : pending ? "speaking" : "listening"}</span>
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          padding: "100px 60px 32px",
        }}
      >
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: 8,
          }}
        >
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
                disabled={!!pending || thinking}
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
              disabled={!!pending || thinking}
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

export function ScreenTimeline({
  onContinue,
  profile,
  simulation,
  setSimulation,
  timelineViewed,
  setTimelineViewed,
  selfie,
  mergePortrait,
}: ScreenProps) {
  const checkpoints = simulation?.checkpointsHigh ?? AE_DATA.checkpointsHigh;
  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;
  const span = endYear - startYear;
  const baseAge = profile.age || 32;

  // On a re-entry (user already watched the auto-play once), drop them at the
  // end with all cards visible — no replay required. On a first visit (or a
  // fresh simulation post-intervention), auto-play from year 0.
  const [t, setT] = useState(timelineViewed ? 1 : 0);
  const [autoplay, setAutoplay] = useState(!timelineViewed);
  const [intervening, setIntervening] = useState<{ idx: number; text: string } | null>(null);
  // While `rewriting` is non-null, the cells from `fromIdx` onward fade out
  // and a generating placeholder appears; new cells materialize from
  // `newCheckpoints` as the stream delivers them.
  const [rewriting, setRewriting] = useState<{
    year: number;
    fromIdx: number;
    phase: string;
    newCheckpoints: Checkpoint[];
  } | null>(null);
  const currentYear = Math.round(startYear + t * span);
  const currentAge = baseAge + (currentYear - startYear);

  // Build the auto-play schedule: drift between events, linger when one lands.
  const keyframes = useMemo(() => {
    const TRANSITION_MS = 2200;  // drift between events
    const HOLD_MS = 1800;        // linger when an event is reached
    const frames: { time: number; t: number }[] = [{ time: 0, t: 0 }];
    let cum = 0;
    for (const cp of checkpoints) {
      const frac = (cp.year - startYear) / span;
      cum += TRANSITION_MS;
      frames.push({ time: cum, t: frac });
      cum += HOLD_MS;
      frames.push({ time: cum, t: frac });
    }
    cum += TRANSITION_MS;
    frames.push({ time: cum, t: 1 });
    return frames;
  }, [checkpoints, startYear, span]);

  // Drive `t` along the keyframes via rAF until the user takes over.
  useEffect(() => {
    if (!autoplay) return;
    if (keyframes.length < 2) return;

    const startedAt = Date.now();
    const totalMs = keyframes[keyframes.length - 1].time;
    let raf: number;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= totalMs) {
        setT(1);
        // Auto-play has finished — flag this sim as viewed so subsequent
        // re-entries skip the replay.
        setTimelineViewed(true);
        return; // stop the loop
      }
      // Find the segment containing `elapsed` and interpolate t inside it.
      let prev = keyframes[0];
      let next = keyframes[keyframes.length - 1];
      for (let i = 1; i < keyframes.length; i++) {
        if (keyframes[i].time >= elapsed) {
          prev = keyframes[i - 1];
          next = keyframes[i];
          break;
        }
      }
      const segDur = next.time - prev.time;
      const segT = segDur === 0 ? 1 : (elapsed - prev.time) / segDur;
      setT(prev.t + segT * (next.t - prev.t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoplay, keyframes]);

  const activeIdx = useMemo(() => {
    let last = -1;
    checkpoints.forEach((c, i) => {
      if (c.year <= currentYear) last = i;
    });
    return last;
  }, [currentYear, checkpoints]);

  // Auto-center the active card. Refs are populated by the CheckpointCard's
  // cardRef prop. `userScrolledRef` flips true the moment the user wheels,
  // touch-drags, or touches the scrollbar — after that we stop fighting them.
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollColRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    const el = scrollColRef.current;
    if (!el) return;
    const markUser = () => {
      userScrolledRef.current = true;
    };
    el.addEventListener("wheel", markUser, { passive: true });
    el.addEventListener("touchmove", markUser, { passive: true });
    // Mousedown on the scrollbar gutter doesn't fire wheel; catch it too.
    el.addEventListener("mousedown", markUser);
    return () => {
      el.removeEventListener("wheel", markUser);
      el.removeEventListener("touchmove", markUser);
      el.removeEventListener("mousedown", markUser);
    };
  }, []);

  useEffect(() => {
    if (activeIdx < 0) return;
    if (userScrolledRef.current) return;
    const card = cardRefs.current[activeIdx];
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  async function submitIntervention(idx: number, text: string) {
    const cp = checkpoints[idx];
    if (!cp) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    // We need the original simulation to send to the backend so it can
    // preserve pre-intervention checkpoints. Fall back to AE_DATA if the
    // live simulation didn't land (rare — chat would have shown the same).
    const originalSim = simulation ?? AE_DATA;
    setIntervening(null);
    setAutoplay(false);
    setRewriting({ year: cp.year, fromIdx: idx, phase: "preparing", newCheckpoints: [] });
    try {
      for await (const ev of simulateBranchStream(profile, cp.year, trimmed, originalSim, selfie!)) {
        if (ev.phase === "counting") {
          setRewriting((r) =>
            r ? { ...r, phase: "redrafting the people in your life" } : null,
          );
        } else if (ev.phase === "plan") {
          setRewriting((r) => (r ? { ...r, phase: "laying out the new years" } : null));
        } else if (ev.phase === "event") {
          // Backend re-emits the pre-intervention (kept) events with their
          // original indices, then streams the NEW events at indices
          // >= fromIdx. We only accumulate the new ones.
          const evtIndex = ev.index;
          const newCp = ev.checkpoint;
          setRewriting((r) => {
            if (!r) return null;
            if (evtIndex < r.fromIdx) return r; // kept event — already shown
            return {
              ...r,
              phase: `writing ${newCp.year}`,
              newCheckpoints: [...r.newCheckpoints, newCp],
            };
          });
        } else if (ev.phase === "finalizing") {
          setRewriting((r) => (r ? { ...r, phase: "stitching it together" } : null));
        } else if (ev.phase === "complete") {
          // Reset agedPortraits to [] in the freshly-completed simulation;
          // post-complete portrait events below will fill them in via
          // mergePortrait, mirroring the App-level runSimulate flow.
          setSimulation({ ...ev.simulation, agedPortraits: [] });
          setRewriting(null);
          // Drop the user at the end of the new trajectory, no replay — they
          // just watched it materialize. They can scrub or intervene again.
          userScrolledRef.current = false;
          setT(1);
          setAutoplay(false);
          setTimelineViewed(true);
          // Don't break — keep iterating so post-complete portrait events
          // are merged into the new simulation.
        } else if (ev.phase === "portrait") {
          mergePortrait(ev.portrait);
        } else if (ev.phase === "error") {
          console.error("branch error:", ev.message);
          break;
        }
      }
    } catch (e) {
      console.error("branch stream failed:", e);
    } finally {
      setRewriting((r) => (r ? null : r)); // clear if not already cleared
    }
  }

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
      <CornerLabel pos="tr">
        {rewriting
          ? `rewriting · from ${rewriting.year}`
          : autoplay
          ? "timeline · auto-play"
          : "timeline · scrubbing"}
      </CornerLabel>

      {rewriting && (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            padding: "10px 18px",
            border: "1px solid var(--accent-line)",
            borderRadius: 4,
            background: "rgba(20, 16, 12, 0.85)",
            backdropFilter: "blur(6px)",
            color: "var(--ink)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "lowercase",
            animation: "fade-in 400ms var(--ease) both",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Wave />
          <span>
            rewriting from {rewriting.year} · {rewriting.phase}
          </span>
        </div>
      )}

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
          {(() => {
            const p = nearestPortrait(simulation?.agedPortraits, "high", currentYear);
            if (p?.imageUrl) {
              return (
                <img
                  src={p.imageUrl}
                  alt={`you at ${p.age}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              );
            }
            return <Portrait age={currentAge} mood={mood} fadeKey={pickPortraitAge(currentAge)} />;
          })()}
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

      <div ref={scrollColRef} style={{ padding: "100px 60px 200px", overflow: "auto" }}>
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
            {/* Pre-intervention cards: original timeline, unchanged */}
            {checkpoints.map((c, i) => {
              const isPostIntervention = !!rewriting && i >= rewriting.fromIdx;
              if (!rewriting) {
                return (
                  <Fragment key={`live-${c.year}`}>
                    <CheckpointCard
                      c={c}
                      active={i === activeIdx}
                      visible={c.year <= currentYear}
                      cardRef={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      onIntervene={
                        c.year <= currentYear
                          ? () => {
                              setAutoplay(false);
                              setTimelineViewed(true);
                              setIntervening({ idx: i, text: "" });
                            }
                          : undefined
                      }
                    />
                    {intervening?.idx === i && (
                      <InterventionEditor
                        year={c.year}
                        text={intervening.text}
                        setText={(s) => setIntervening({ idx: i, text: s })}
                        onCancel={() => setIntervening(null)}
                        onSubmit={() => submitIntervention(i, intervening.text)}
                      />
                    )}
                  </Fragment>
                );
              }
              if (isPostIntervention) {
                // This original card is being replaced — render it as a
                // VanishingCard so it fades out smoothly.
                return <VanishingCard key={`old-${c.year}-${i}`} c={c} />;
              }
              // Pre-intervention card during a rewrite: stays put, untouched.
              return (
                <CheckpointCard
                  key={`live-${c.year}`}
                  c={c}
                  active={false}
                  visible
                />
              );
            })}

            {/* During a rewrite, the new cards materialize one by one as the
                stream delivers them, in the slot just below the unchanged cards. */}
            {rewriting?.newCheckpoints.map((cp, j) => (
              <CheckpointCard
                key={`new-${cp.year}-${j}`}
                c={cp}
                active={j === rewriting.newCheckpoints.length - 1}
                visible
              />
            ))}

            {/* Generating placeholder — shown until the stream completes */}
            {rewriting && <GeneratingCard rewriting={rewriting} />}
          </div>
        </div>
      </div>

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
            {autoplay ? `playing · ${startYear} → ${endYear}` : `scrub · ${startYear} → ${endYear}`}
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
          onChange={(e) => {
            setAutoplay(false); // user takes manual control of time
            setTimelineViewed(true); // and counts as having seen it
            // Slider drag means fresh exploration intent — let auto-centering
            // re-engage so the active card follows the scrub.
            userScrolledRef.current = false;
            setT(Number(e.target.value) / 1000);
          }}
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
  cardRef,
  onIntervene,
}: {
  c: Checkpoint;
  active: boolean;
  visible: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
  onIntervene?: () => void;
}) {
  const toneColor = TONE_COLOR[c.tone];
  return (
    <div
      ref={cardRef}
      className="card"
      style={{
        opacity: visible ? 1 : 0.18,
        borderColor: active ? "var(--accent-line)" : undefined,
        transform: active ? "translateX(8px)" : "translateX(0)",
        pointerEvents: visible ? "auto" : "none",
        position: "relative",
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
            background: toneColor,
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
      {onIntervene && visible && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px dashed var(--line-soft)",
          }}
        >
          <button
            className="under"
            onClick={onIntervene}
            style={{ fontSize: 12, letterSpacing: "0.14em" }}
          >
            change this moment →
          </button>
        </div>
      )}
    </div>
  );
}

function InterventionEditor({
  year,
  text,
  setText,
  onCancel,
  onSubmit,
}: {
  year: number;
  text: string;
  setText: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        marginTop: -2,
        animation: "fade-in 500ms var(--ease) both",
        borderColor: "var(--accent-line)",
      }}
    >
      <Meta style={{ marginBottom: 14, color: "var(--accent)" }}>
        intervene at {year}
      </Meta>
      <div
        className="serif"
        style={{
          fontSize: 17,
          fontStyle: "italic",
          color: "var(--ink-1)",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        What would you do differently this year? The trajectory will rewrite from here.
      </div>
      <textarea
        className="field"
        autoFocus
        rows={3}
        placeholder="I would refuse the promotion. I would call my sister."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 24,
          marginTop: 14,
        }}
      >
        <button className="under" onClick={onCancel} style={{ fontSize: 12 }}>
          cancel
        </button>
        <button
          className="under"
          onClick={onSubmit}
          disabled={!text.trim()}
          style={{
            fontSize: 12,
            color: text.trim() ? "var(--accent)" : "var(--ink-3)",
          }}
        >
          rewrite from here →
        </button>
      </div>
    </div>
  );
}

/**
 * VanishingCard — a checkpoint that's being replaced by a rewrite.
 * Briefly visible, then collapses opacity + height to 0 over ~1.4s.
 */
function VanishingCard({ c }: { c: Checkpoint }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // Trigger the collapse on next frame so the transition has a "from" state.
    const id = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(id);
  }, []);
  const toneColor = TONE_COLOR[c.tone];
  return (
    <div
      className="card"
      style={{
        opacity: open ? 0.45 : 0,
        maxHeight: open ? 600 : 0,
        marginTop: open ? 0 : -18, // also collapse the gap
        paddingTop: open ? undefined : 0,
        paddingBottom: open ? undefined : 0,
        transition:
          "opacity 1200ms cubic-bezier(0.22, 0.61, 0.36, 1), " +
          "max-height 1400ms cubic-bezier(0.22, 0.61, 0.36, 1), " +
          "margin-top 1400ms cubic-bezier(0.22, 0.61, 0.36, 1), " +
          "padding 1400ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        overflow: "hidden",
        pointerEvents: "none",
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
            background: toneColor,
            opacity: 0.4,
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
          color: "var(--ink-2)",
          lineHeight: 1.3,
        }}
      >
        {c.title}
      </h3>
    </div>
  );
}

/**
 * GeneratingCard — placeholder shown in the cells' slot while the rewrite
 * stream is in flight. Carries the live phase ("writing 2032", etc).
 */
function GeneratingCard({
  rewriting,
}: {
  rewriting: { year: number; phase: string };
}) {
  return (
    <div
      className="card"
      style={{
        animation: "fade-in 600ms var(--ease) both",
        borderStyle: "dashed",
        borderColor: "var(--accent-line)",
        textAlign: "center",
        padding: "32px 24px",
        background: "rgba(212, 165, 116, 0.04)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Wave />
        <Meta style={{ color: "var(--accent)" }}>
          rewriting from {rewriting.year}
        </Meta>
      </div>
      <div
        style={{
          marginTop: 14,
          color: "var(--ink-2)",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "lowercase",
        }}
      >
        {rewriting.phase}
      </div>
    </div>
  );
}

export function ScreenSlider({
  onContinue,
  onBack,
  profile,
  simulation,
  setTimelineViewed,
}: ScreenProps) {
  // Reaching the slider always counts as having seen the timeline. Going back
  // from here should drop the user straight into intervention mode (all events
  // visible, no auto-play replay), regardless of how they got to the slider.
  useEffect(() => {
    setTimelineViewed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [hours, setHours] = useState(profile.workHours || 65);
  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;
  const baseAge = profile.age || 32;

  const isLow = hours <= 50;
  const high = simulation?.checkpointsHigh ?? AE_DATA.checkpointsHigh;
  const low = simulation?.checkpointsLow ?? AE_DATA.checkpointsLow;
  const checkpoints = isLow ? low : high;
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
          {(() => {
            const p = nearestPortrait(simulation?.agedPortraits, isLow ? "low" : "high", endYear);
            if (p?.imageUrl) {
              return (
                <img
                  src={p.imageUrl}
                  alt={`you at ${p.age}, ${isLow ? "alternate" : "current"} path`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 8,
                    transition: "filter 700ms var(--ease)",
                  }}
                />
              );
            }
            return <Portrait age={finalAge} mood={mood} fadeKey={isLow ? "low" : "high"} />;
          })()}
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

          <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 32 }}>
            <Meta style={{ marginBottom: 18 }}>a representative year · {checkpoints[2].year}</Meta>
            <CheckpointCard c={checkpoints[2]} active visible />
          </div>
        </div>
      </div>

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
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <button className="under" onClick={onBack}>
            ← change a specific moment
          </button>
          <button className="under" onClick={onContinue}>
            see them side by side →
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScreenEncore({ onRestart, profile, simulation }: ScreenProps) {
  const baseAge = profile.age || 32;
  const endYear = profile.targetYear || 2046;
  const finalAge = baseAge + (endYear - (profile.presentYear || 2026));
  const highCps = simulation?.checkpointsHigh ?? AE_DATA.checkpointsHigh;
  const lowCps = simulation?.checkpointsLow ?? AE_DATA.checkpointsLow;
  const high = highCps[highCps.length - 1];
  const low = lowCps[lowCps.length - 1];
  const replies = simulation?.futureSelfReplies ?? AE_DATA.futureSelfReplies;
  const changeReply = replies["What should I change?"];
  const portraits = simulation?.agedPortraits;

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
          portraits={portraits}
          trajectory="high"
          endYear={endYear}
        />
        <div style={{ background: "var(--line-soft)" }} />
        <FutureColumn
          label="at 45 hrs"
          portraitMood="warm"
          age={finalAge}
          cp={low}
          accent
          fadeKey="enc-low"
          portraits={portraits}
          trajectory="low"
          endYear={endYear}
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
          “{changeReply.split(".")[0]}.”
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
  portraits,
  trajectory,
  endYear,
}: {
  label: string;
  portraitMood: PortraitMood;
  age: number;
  cp: Checkpoint;
  accent: boolean;
  fadeKey: string;
  portraits?: AgedPortrait[];
  trajectory: Trajectory;
  endYear: number;
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
        {(() => {
          const p = nearestPortrait(portraits, trajectory, endYear);
          if (p?.imageUrl) {
            return (
              <img
                src={p.imageUrl}
                alt={`you at ${p.age}, ${trajectory} path`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: 8,
                }}
              />
            );
          }
          return <Portrait age={age} mood={portraitMood} fadeKey={fadeKey} />;
        })()}
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
