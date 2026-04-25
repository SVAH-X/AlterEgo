import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { clamp } from "./atoms";
import { AE_DATA } from "./data";
import type { Profile } from "./types";
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
  onRestart: () => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
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

  const go = (i: number) => setIdx(clamp(i, 0, SCREENS.length - 1));
  const next = () => setIdx((i) => clamp(i + 1, 0, SCREENS.length - 1));
  const restart = () => setIdx(0);

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
          onRestart={restart}
          profile={profile}
          setProfile={setProfile}
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
