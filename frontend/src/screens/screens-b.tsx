import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenProps } from "../App";
import { Mark, Meta, PortraitImage, Wave, useStreamedText } from "../atoms";
import { AE_DATA } from "../data";
import { chat, simulateBranchStream } from "../lib/api";
import { nearestPortrait } from "../lib/portraits";
import type { Checkpoint, Tone } from "../types";
import { useVoice, useVoicePrimed } from "../voice/VoiceContext";
import { useTTSPlayer } from "../voice/useTTSPlayer";
import { MicButton } from "../voice/MicButton";

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

export function ScreenChat({ onContinue, onJumpTo, profile, simulation }: ScreenProps) {
  const olderAge =
    (Number(profile.age) || 32) +
    ((Number(profile.targetYear) - Number(profile.presentYear)) || 20);

  const opening = simulation?.futureSelfOpening ?? AE_DATA.futureSelfOpening;
  const replies = simulation?.futureSelfReplies ?? AE_DATA.futureSelfReplies;
  const suggestions = Object.keys(replies);

  const { voiceMode, clonedVoiceId } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();

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

  // Auto-play each new future-self utterance in the cloned voice.
  useEffect(() => {
    if (!pending) return;
    if (!voiceMode || !voicePrimed) return;
    tts.play(pending, clonedVoiceId ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, voiceMode, voicePrimed, clonedVoiceId]);

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

  // Auto-play the opening on entry (it's a `done: true` message, so the
  // pending-effect above doesn't catch it).
  useEffect(() => {
    if (voiceMode && voicePrimed) tts.play(opening, clonedVoiceId ?? undefined);
    return () => tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
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
            return <PortraitImage src={p?.imageUrl} alt={p ? `you at ${p.age}` : "you"} />;
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
              placeholder="Ask something else…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) ask(input.trim());
              }}
              disabled={!!pending || thinking}
            />
            {voiceMode && (
              <MicButton
                size="sm"
                disabled={!!pending || thinking}
                onTranscript={(t) => {
                  const q = t.trim();
                  if (q) ask(q);
                }}
                title="Speak your question"
              />
            )}
            <button className="under" onClick={onContinue}>
              the end →
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
  onJumpTo,
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

  // `t` is driven by scroll position in the right column (or by the slider,
  // which programmatically scrolls to match). On a re-entry, we initialize
  // scroll to the bottom so all cards land lit.
  const [t, setT] = useState(timelineViewed ? 1 : 0);
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
  // Spans the full regeneration pipeline (from intervention submit through the
  // last post-complete portrait event), so the portrait overlay stays up while
  // new faces are still streaming in even after `rewriting` clears.
  const [regenerating, setRegenerating] = useState(false);
  const currentYear = Math.round(startYear + t * span);
  const currentAge = baseAge + (currentYear - startYear);

  const activeIdx = useMemo(() => {
    let last = -1;
    checkpoints.forEach((c, i) => {
      if (c.year <= currentYear) last = i;
    });
    return last;
  }, [currentYear, checkpoints]);

  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollColRef = useRef<HTMLDivElement | null>(null);
  // Set true just before we programmatically write `scrollTop` (e.g. from the
  // slider) so the scroll listener doesn't redundantly re-derive `t` from the
  // value it just produced.
  const programmaticScrollRef = useRef(false);

  // Page scroll → `t`. Maps scrollTop / (scrollHeight - clientHeight) to [0, 1].
  useEffect(() => {
    const el = scrollColRef.current;
    if (!el) return;
    const onScroll = () => {
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const next = Math.min(1, Math.max(0, el.scrollTop / max));
      setT(next);
      setTimelineViewed(true);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [setTimelineViewed]);

  // On first mount, if the user has already viewed this timeline, jump scroll
  // to the bottom so every card lands lit instead of replaying from the top.
  useEffect(() => {
    if (!timelineViewed) return;
    const el = scrollColRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    programmaticScrollRef.current = true;
    el.scrollTop = max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setRegenerating(true);
    setRewriting({ year: cp.year, fromIdx: idx, phase: "preparing", newCheckpoints: [] });
    // Drop the stale aged portraits immediately — we don't want the user
    // staring at their old future face while the new path is being written.
    // setSimulation resets timelineViewed; restore it on the same tick.
    if (simulation) {
      setSimulation({ ...simulation, agedPortraits: [] });
      setTimelineViewed(true);
    }
    try {
      for await (const ev of simulateBranchStream(profile, cp.year, trimmed, originalSim, selfie)) {
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
          // The backend no longer re-emits pre-intervention high portraits to
          // save upload bytes — it strips them out. We retain the originals
          // locally and re-merge them here so the slider/encore screens still
          // have early-life faces.
          const preservedHigh = (originalSim.agedPortraits ?? []).filter(
            (p) => p.trajectory === "high" && p.year < cp.year,
          );
          setSimulation({
            ...ev.simulation,
            agedPortraits: [...preservedHigh, ...ev.simulation.agedPortraits],
          });
          setRewriting(null);
          // Drop the user at the end of the new trajectory, no replay — they
          // just watched it materialize. They can scroll back or intervene
          // again.
          setT(1);
          setTimelineViewed(true);
          const el = scrollColRef.current;
          if (el) {
            const max = el.scrollHeight - el.clientHeight;
            if (max > 0) {
              programmaticScrollRef.current = true;
              el.scrollTop = max;
            }
          }
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
      setRegenerating(false);
    }
  }

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
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
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
            position: "relative",
          }}
        >
          {(() => {
            const p = nearestPortrait(simulation?.agedPortraits, "high", currentYear, Infinity);
            return <PortraitImage src={p?.imageUrl} alt={p ? `you at ${p.age}` : "you"} />;
          })()}
          {regenerating && (
            <div
              aria-live="polite"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 8,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 2,
                  background:
                    "linear-gradient(90deg, transparent, var(--accent, #d8b86a), transparent)",
                  animation: "sweep 2.4s linear infinite",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  right: 12,
                  bottom: 14,
                  display: "flex",
                  justifyContent: "center",
                  animation: "fade-in 400ms var(--ease) both",
                }}
              >
                <div
                  style={{
                    maxWidth: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--accent-line)",
                    borderRadius: 4,
                    background: "rgba(20, 16, 12, 0.85)",
                    backdropFilter: "blur(6px)",
                    color: "var(--ink)",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "lowercase",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <Wave />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    regenerating
                  </span>
                </div>
              </div>
            </div>
          )}
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
          background: "linear-gradient(180deg, rgba(10,9,8,0.85), var(--bg) 24px)",
          backdropFilter: "blur(8px)",
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
          <Meta>scrub · {startYear} → {endYear}</Meta>
          <button className="under" onClick={onContinue}>
            meet your future self →
          </button>
        </div>
        <input
          type="range"
          className="fancy"
          min={0}
          max={1000}
          value={t * 1000}
          onChange={(e) => {
            const newT = Number(e.target.value) / 1000;
            setTimelineViewed(true);
            setT(newT);
            // Keep page scroll in lock-step with the slider so the two
            // controls stay coherent.
            const el = scrollColRef.current;
            if (el) {
              const max = el.scrollHeight - el.clientHeight;
              if (max > 0) {
                programmaticScrollRef.current = true;
                el.scrollTop = newT * max;
              }
            }
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
  const { voiceMode, clonedVoiceId } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();
  const prompt =
    "What would you do differently this year? The trajectory will rewrite from here.";
  useEffect(() => {
    if (voiceMode && voicePrimed) tts.play(prompt, clonedVoiceId ?? undefined);
    return () => tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
        {prompt}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <textarea
          className="field"
          autoFocus
          rows={3}
          style={{ flex: 1, minWidth: 0 }}
          placeholder="I would refuse the promotion. I would call my sister."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
        {voiceMode && (
          <div style={{ paddingTop: 8 }}>
            <MicButton
              onTranscript={(t) => setText((text ? text + " " : "") + t)}
              title="Speak your intervention"
            />
          </div>
        )}
      </div>
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

export function ScreenEnd({ onRestart, onJumpTo, profile, simulation }: ScreenProps) {
  const baseAge = profile.age || 32;
  const startYear = profile.presentYear || 2026;
  const endYear = profile.targetYear || 2046;
  const finalAge = baseAge + (endYear - startYear);

  const replies = simulation?.futureSelfReplies ?? AE_DATA.futureSelfReplies;
  const changeReply = replies["What should I change?"] ?? "";
  const closingLine = changeReply ? changeReply.split(".")[0] + "." : "";

  const { voiceMode, clonedVoiceId } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();
  useEffect(() => {
    if (!closingLine) return;
    if (voiceMode && voicePrimed) {
      const id = setTimeout(
        () => tts.play(closingLine, clonedVoiceId ?? undefined),
        1200,
      );
      return () => {
        clearTimeout(id);
        tts.stop();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 60px",
      }}
    >
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          maxWidth: 720,
          textAlign: "center",
          animation: "fade-in 1200ms var(--ease) both",
        }}
      >
        <div style={{ width: "min(360px, 32vw)", height: "min(50vh, 460px)" }}>
          {(() => {
            const p = nearestPortrait(simulation?.agedPortraits, "high", endYear);
            return <PortraitImage src={p?.imageUrl} alt={p ? `you at ${p.age}` : "you"} />;
          })()}
        </div>

        <Meta>
          {profile.name || "Sarah"} · age {finalAge} · {endYear}
        </Meta>

        <h2
          className="serif"
          style={{
            fontSize: 44,
            fontWeight: 400,
            fontStyle: "italic",
            margin: 0,
            lineHeight: 1.2,
            color: "var(--ink)",
            letterSpacing: "0.005em",
          }}
        >
          The end.
        </h2>

        {closingLine && (
          <p
            className="serif"
            style={{
              fontSize: 19,
              lineHeight: 1.6,
              fontStyle: "italic",
              color: "var(--ink-1)",
              margin: 0,
              maxWidth: 560,
            }}
          >
            “{closingLine}”
          </p>
        )}

        <button
          className="under"
          onClick={onRestart}
          style={{ marginTop: 24, fontSize: 13, letterSpacing: "0.18em" }}
        >
          ← begin again
        </button>
      </div>
    </div>
  );
}

