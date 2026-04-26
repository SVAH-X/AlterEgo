import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { clamp } from "./atoms";
import { simulateStream } from "./lib/api";
import type {
  AgedPortrait,
  AgentSpec,
  Checkpoint,
  Profile,
  SimulationData,
} from "./types";
import {
  ScreenHealth,
  ScreenIntake,
  ScreenLanding,
  ScreenProcessing,
  ScreenReveal,
} from "./screens/screens-a";
import {
  ScreenChat,
  ScreenEnd,
  ScreenTimeline,
} from "./screens/screens-b";
import { ScreenSelfie } from "./screens/screen-selfie";
import { ScreenModeSelect } from "./screens/screen-mode-select";
import { VoiceModeToggle } from "./voice/VoiceModeToggle";
import { useVoice } from "./voice/VoiceContext";
import { deleteVoice } from "./lib/voice";

export type SimStreamPhase =
  | "idle"
  | "counting"
  | "plan"
  | "events"
  | "finalizing"
  | "complete"
  | "error";

export interface FilledOutline {
  year: number;
  severity: number;
  hint: string;
  primary_actors: string[];
  visibility: string[];
  filled: boolean;
  pulse: number;
  title?: string;
  checkpoint?: Checkpoint;
  /** ms timestamp when this outline entry was filled — drives "active" pulse decay */
  filledAt?: number;
}

export interface ScreenProps {
  onContinue: () => void;
  onBack: () => void;
  onJumpTo: (key: string) => void;
  onRestart: () => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  simulation: SimulationData | null;
  setSimulation: (s: SimulationData | null) => void;
  timelineViewed: boolean;
  setTimelineViewed: (v: boolean) => void;
  selfieUploaded: boolean;
  setSelfieUploaded: (v: boolean) => void;
  pushVoiceSample: (blob: Blob) => void;
  selfie: Blob | null;
  setSelfie: (s: Blob | null) => void;
  simStreamPhase: SimStreamPhase;
  agents: AgentSpec[];
  /** ms timestamp when each agent_id became known — drives staggered arrival animations */
  agentArrivedAt: Record<string, number>;
  outline: FilledOutline[];
  latestTitle: string;
  /** ms timestamp the plan was received — drives ghost-event reveal stagger */
  planArrivedAt: number | null;
  portraitsDone: number;
  mergePortrait: (p: AgedPortrait) => void;
  runSimulate: () => void;
  errorMessage: string | null;
}

interface ScreenDef {
  key: string;
  component: ComponentType<ScreenProps>;
  label: string;
}

const SCREENS: ScreenDef[] = [
  { key: "landing", component: ScreenLanding, label: "01 cold open" },
  { key: "selfie", component: ScreenSelfie, label: "02 selfie" },
  { key: "modeSelect", component: ScreenModeSelect, label: "03 mode" },
  { key: "intake", component: ScreenIntake, label: "04 intake" },
  { key: "health", component: ScreenHealth, label: "05 health" },
  { key: "processing", component: ScreenProcessing, label: "06 processing" },
  { key: "reveal", component: ScreenReveal, label: "07 reveal" },
  { key: "timeline", component: ScreenTimeline, label: "08 timeline" },
  { key: "chat", component: ScreenChat, label: "09 chat" },
  { key: "end", component: ScreenEnd, label: "10 end" },
];

const PRESENT_YEAR = new Date().getFullYear();

const EMPTY_PROFILE: Profile = {
  name: "",
  age: 0,
  occupation: "",
  workHours: 0,
  topGoal: "",
  topFear: "",
  presentYear: PRESENT_YEAR,
  targetYear: PRESENT_YEAR,
};

const TRANSITION_MS = 500;

function humanizeSimError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("authenticationerror") ||
    lower.includes("authentication_error") ||
    lower.includes("invalid x-api-key")
  ) {
    return "Simulation auth failed (check ANTHROPIC_API_KEY).";
  }
  return message;
}

export default function App() {
  const { clonedVoiceId, setClonedVoiceId, clearIntakeSamples, setInputMode } = useVoice();
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const prevTimerRef = useRef<number | null>(null);
  const [profile, setProfile] = useState<Profile>({ ...EMPTY_PROFILE });
  const [simulation, setSimulationState] = useState<SimulationData | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [timelineViewed, setTimelineViewed] = useState(false);
  // We never store the file itself — just whether the user gave us one.
  // Skipped uploads → blurred placeholder portraits (don't show random stock faces as "you").
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [simStreamPhase, setSimStreamPhase] = useState<SimStreamPhase>("idle");
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [agentArrivedAt, setAgentArrivedAt] = useState<Record<string, number>>({});
  const [outline, setOutline] = useState<FilledOutline[]>([]);
  const [latestTitle, setLatestTitle] = useState<string>("");
  const [planArrivedAt, setPlanArrivedAt] = useState<number | null>(null);
  const [portraitsDone, setPortraitsDone] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track an active stream so we don't fire two consumers concurrently.
  const streamingRef = useRef(false);

  // Audio Blobs collected from MicButton during intake. Held in a ref because
  // nothing in the render path consumes them — they sit here as the "port" for
  // the future ElevenLabs voice-cloning pipeline (POST samples to /voice/clone,
  // persist voice_id on the profile).
  const voiceSamplesRef = useRef<Blob[]>([]);
  const pushVoiceSample = (blob: Blob) => {
    voiceSamplesRef.current.push(blob);
  };

  const beginTransition = (from: number) => {
    setPrevIdx(from);
    if (prevTimerRef.current) window.clearTimeout(prevTimerRef.current);
    prevTimerRef.current = window.setTimeout(() => {
      setPrevIdx(null);
      prevTimerRef.current = null;
    }, TRANSITION_MS);
  };
  const go = (i: number) => {
    setIdx((current) => {
      const target = clamp(i, 0, SCREENS.length - 1);
      if (target !== current) beginTransition(current);
      return target;
    });
  };
  const next = () => {
    setIdx((i) => {
      const target = clamp(i + 1, 0, SCREENS.length - 1);
      if (target === i) return i;
      if (SCREENS[i].key === "timeline") setTimelineViewed(true);
      beginTransition(i);
      return target;
    });
  };
  const back = () =>
    setIdx((i) => {
      const target = clamp(i - 1, 0, SCREENS.length - 1);
      if (target !== i) beginTransition(i);
      return target;
    });
  const jumpTo = (key: string) => {
    const j = SCREENS.findIndex((s) => s.key === key);
    if (j >= 0) go(j);
  };
  useEffect(() => {
    return () => {
      if (prevTimerRef.current) window.clearTimeout(prevTimerRef.current);
    };
  }, []);
  const restart = () => {
    if (clonedVoiceId) deleteVoice(clonedVoiceId);
    setClonedVoiceId(null);
    clearIntakeSamples();
    setInputMode(null);
    setSimulationState(null);
    setTimelineViewed(false);
    setSelfieUploaded(false);
    setSelfie(null);
    setSimStreamPhase("idle");
    setAgents([]);
    setAgentArrivedAt({});
    setOutline([]);
    setLatestTitle("");
    setPlanArrivedAt(null);
    setPortraitsDone(0);
    setErrorMessage(null);
    streamingRef.current = false;
    voiceSamplesRef.current = [];
    setIdx(0);
  };

  // setSimulation is the user-facing setter that ALSO resets timelineViewed —
  // used when a fresh simulation arrives (initial gen or post-intervention).
  // For mid-stream portrait merges we use mergePortrait which does NOT reset.
  const setSimulation = (s: SimulationData | null) => {
    setSimulationState(s);
    setTimelineViewed(false);
  };

  // AMENDMENT A3: portrait merge that doesn't trip the timelineViewed reset.
  const mergePortrait = (portrait: AgedPortrait) => {
    setSimulationState((sim) => sim ? { ...sim, agedPortraits: [...sim.agedPortraits, portrait] } : sim);
  };

  // AMENDMENT A2: simulate stream consumer lives at App level so portraits
  // continue arriving after the user advances past Processing.
  const runSimulate = () => {
    if (streamingRef.current) return; // guard against double-start
    streamingRef.current = true;
    // Token guards against a restart-mid-stream race: if the user hits
    // restart while events are in flight, restart() flips streamingRef to
    // false; subsequent events from the orphaned IIFE see streamingRef !==
    // true and break out instead of writing stale state.
    const myRunIsAlive = () => streamingRef.current;
    // Reset processing state so a re-run starts fresh.
    setSimStreamPhase("counting");
    setAgents([]);
    setAgentArrivedAt({});
    setOutline([]);
    setLatestTitle("");
    setPlanArrivedAt(null);
    setPortraitsDone(0);
    setErrorMessage(null);
    (async () => {
      try {
        for await (const ev of simulateStream(profile, selfie)) {
          if (!myRunIsAlive()) break;
          if (ev.phase === "counting") {
            setAgents(ev.agents);
            // Stagger arrival timestamps so the constellation reads as agents
            // walking onstage one-by-one, even though the backend emits the
            // full list in a single event. ~350ms per agent feels considered.
            const t0 = performance.now();
            const stagger = 350;
            const arrived: Record<string, number> = {};
            ev.agents.forEach((a, i) => {
              arrived[a.agent_id] = t0 + i * stagger;
            });
            setAgentArrivedAt(arrived);
            setSimStreamPhase("counting");
          } else if (ev.phase === "plan") {
            setOutline(
              ev.outline.map((o) => ({
                year: o.year,
                severity: o.severity,
                hint: o.hint,
                primary_actors: o.primary_actors,
                visibility: o.visibility,
                filled: false,
                pulse: 0,
              })),
            );
            setPlanArrivedAt(performance.now());
            setSimStreamPhase("plan");
          } else if (ev.phase === "event") {
            const cp = ev.checkpoint;
            const now = performance.now();
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
                  checkpoint: cp,
                  filledAt: now,
                };
              }
              return next;
            });
            setLatestTitle(cp.title);
            setSimStreamPhase("events");
          } else if (ev.phase === "finalizing") {
            setSimStreamPhase("finalizing");
            setLatestTitle("polishing the details");
          } else if (ev.phase === "complete") {
            setSimulationState(ev.simulation);
            setTimelineViewed(false);
            setSimStreamPhase("complete");
          } else if (ev.phase === "portrait") {
            setPortraitsDone((n) => n + 1);
            mergePortrait(ev.portrait);
          } else if (ev.phase === "portrait_error") {
            setPortraitsDone((n) => n + 1);
          } else if (ev.phase === "error") {
            setErrorMessage(humanizeSimError(ev.message));
            setSimStreamPhase("error");
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMessage(humanizeSimError(msg));
        setSimStreamPhase("error");
      } finally {
        streamingRef.current = false;
      }
    })();
  };

  const idxRef = useRef(idx);
  idxRef.current = idx;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input, textarea")) return;
      if (e.key === "ArrowRight") go(idxRef.current + 1);
      if (e.key === "ArrowLeft") go(idxRef.current - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Active = SCREENS[idx].component;
  const Prev = prevIdx !== null ? SCREENS[prevIdx].component : null;

  const screenProps: ScreenProps = {
    onContinue: next,
    onBack: back,
    onJumpTo: jumpTo,
    onRestart: restart,
    profile,
    setProfile,
    simulation,
    setSimulation,
    timelineViewed,
    setTimelineViewed,
    selfieUploaded,
    setSelfieUploaded,
    pushVoiceSample,
    selfie,
    setSelfie,
    simStreamPhase,
    agents,
    agentArrivedAt,
    outline,
    latestTitle,
    planArrivedAt,
    portraitsDone,
    mergePortrait,
    runSimulate,
    errorMessage,
  };

  const noop = () => { };
  const leavingProps: ScreenProps = {
    ...screenProps,
    onContinue: noop,
    onBack: noop,
    onJumpTo: noop,
    onRestart: noop,
  };

  return (
    <div id="stage" className="grain" data-screen-label={SCREENS[idx].label}>
      {Prev && prevIdx !== null && (
        <div
          key={`prev-${SCREENS[prevIdx].key}-${prevIdx}`}
          className="screen leaving"
          aria-hidden="true"
        >
          <Prev {...leavingProps} />
        </div>
      )}
      <div key={SCREENS[idx].key} className="screen entering">
        <Active {...screenProps} />
      </div>

      <VoiceModeToggle />

      <div className="devnav">
        {SCREENS.map((s, i) => (
          <button key={s.key} className={i === idx ? "on" : ""} onClick={() => go(i)}>
            {s.label.split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}