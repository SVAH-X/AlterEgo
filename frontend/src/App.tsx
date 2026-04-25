import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { clamp } from "./atoms";
import { AE_DATA } from "./data";
import type { Profile, SimulationData } from "./types";
import {
  ScreenIntake,
  ScreenLanding,
  ScreenProcessing,
  ScreenReveal,
} from "./screens/screens-a";
import {
  ScreenChat,
  ScreenEncore,
  ScreenSlider,
  ScreenTimeline,
} from "./screens/screens-b";

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
}

interface ScreenDef {
  key: string;
  component: ComponentType<ScreenProps>;
  label: string;
}

const SCREENS: ScreenDef[] = [
  { key: "landing", component: ScreenLanding, label: "01 cold open" },
  { key: "intake", component: ScreenIntake, label: "02 intake" },
  { key: "processing", component: ScreenProcessing, label: "03 processing" },
  { key: "reveal", component: ScreenReveal, label: "04 reveal" },
  { key: "chat", component: ScreenChat, label: "05 chat" },
  { key: "timeline", component: ScreenTimeline, label: "06 timeline" },
  { key: "slider", component: ScreenSlider, label: "07 slider" },
  { key: "encore", component: ScreenEncore, label: "08 encore" },
];

export default function App() {
  const [idx, setIdx] = useState(0);
  const [profile, setProfile] = useState<Profile>({ ...AE_DATA.profile });
  const [simulation, setSimulationState] = useState<SimulationData | null>(null);
  // `timelineViewed` flips true when the user advances PAST the timeline screen
  // (i.e., they've already watched the auto-play). On re-entry we skip replay
  // and drop them at t=1 so they can directly intervene.
  const [timelineViewed, setTimelineViewed] = useState(false);
  // We never store the file itself — just whether the user gave us one.
  // Skipped uploads → blurred placeholder portraits (don't show random stock faces as "you").
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  // Audio Blobs collected from MicButton during intake. Held in a ref because
  // nothing in the render path consumes them — they sit here as the "port" for
  // the future ElevenLabs voice-cloning pipeline (POST the concatenation to
  // /elevenlabs/clone, persist voice_id on the profile).
  const voiceSamplesRef = useRef<Blob[]>([]);
  const pushVoiceSample = (blob: Blob) => {
    voiceSamplesRef.current.push(blob);
  };

  const go = (i: number) => setIdx(clamp(i, 0, SCREENS.length - 1));
  const next = () => {
    setIdx((i) => {
      // Mark the timeline as viewed when leaving it forward.
      if (SCREENS[i].key === "timeline") setTimelineViewed(true);
      return clamp(i + 1, 0, SCREENS.length - 1);
    });
  };
  const back = () => setIdx((i) => clamp(i - 1, 0, SCREENS.length - 1));
  const jumpTo = (key: string) => {
    const j = SCREENS.findIndex((s) => s.key === key);
    if (j >= 0) setIdx(j);
  };
  const restart = () => {
    setSimulationState(null);
    setTimelineViewed(false);
    setSelfieUploaded(false);
    voiceSamplesRef.current = [];
    setIdx(0);
  };
  // Wrap setSimulation so a freshly arrived simulation (post-intervention or
  // first generation) resets the "viewed" flag — the user will want auto-play
  // for the new trajectory.
  const setSimulation = (s: SimulationData | null) => {
    setSimulationState(s);
    setTimelineViewed(false);
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

  return (
    <div id="stage" className="grain" data-screen-label={SCREENS[idx].label}>
      <div key={SCREENS[idx].key} className="screen active">
        <Active
          onContinue={next}
          onBack={back}
          onJumpTo={jumpTo}
          onRestart={restart}
          profile={profile}
          setProfile={setProfile}
          simulation={simulation}
          setSimulation={setSimulation}
          timelineViewed={timelineViewed}
          setTimelineViewed={setTimelineViewed}
          selfieUploaded={selfieUploaded}
          setSelfieUploaded={setSelfieUploaded}
          pushVoiceSample={pushVoiceSample}
        />
      </div>

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
