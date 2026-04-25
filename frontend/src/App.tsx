import { useEffect, useState } from "react";
import type { ComponentType } from "react";
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

interface ScreenProps {
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

// Each screen ignores the props it doesn't use; the wrapper passes them all.
const SCREENS: ScreenDef[] = [
  { key: "landing", component: ScreenLanding as ComponentType<ScreenProps>, label: "01 cold open" },
  { key: "intake", component: ScreenIntake as ComponentType<ScreenProps>, label: "02 intake" },
  { key: "processing", component: ScreenProcessing as ComponentType<ScreenProps>, label: "03 processing" },
  { key: "reveal", component: ScreenReveal as ComponentType<ScreenProps>, label: "04 reveal" },
  { key: "chat", component: ScreenChat as ComponentType<ScreenProps>, label: "05 chat" },
  { key: "timeline", component: ScreenTimeline as ComponentType<ScreenProps>, label: "06 timeline" },
  { key: "slider", component: ScreenSlider as ComponentType<ScreenProps>, label: "07 slider" },
  { key: "encore", component: ScreenEncore as ComponentType<ScreenProps>, label: "08 encore" },
];

export default function App() {
  const [idx, setIdx] = useState(0);
  const [profile, setProfile] = useState<Profile>({ ...AE_DATA.profile });

  const go = (i: number) => setIdx(Math.max(0, Math.min(SCREENS.length - 1, i)));
  const next = () => go(idx + 1);
  const restart = () => go(0);

  // keyboard shortcuts: ← / →
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input, textarea")) return;
      if (e.key === "ArrowRight") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]);

  return (
    <div id="stage" className="grain" data-screen-label={SCREENS[idx].label}>
      {SCREENS.map(({ key, component: C }, i) => (
        <div key={key} className={"screen" + (i === idx ? " active" : "")}>
          {/* mount only when active to avoid timers running everywhere */}
          {i === idx && (
            <C
              onContinue={next}
              onRestart={restart}
              profile={profile}
              setProfile={setProfile}
            />
          )}
        </div>
      ))}

      {/* dev nav — collapsed dot in bottom-right; expands on hover */}
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
