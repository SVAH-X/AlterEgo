import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

// picsum seeds aren't real portraits — the filter/vignette + SVG fallback figure
// underneath are what make the frame read as "a person".
export const PORTRAITS: Record<number, string> = {
  32: "https://picsum.photos/seed/sarah-thirtytwo/900/1200",
  38: "https://picsum.photos/seed/sarah-thirtyeight/900/1200",
  45: "https://picsum.photos/seed/sarah-fortyfive/900/1200",
  52: "https://picsum.photos/seed/sarah-fiftytwo/900/1200",
  56: "https://picsum.photos/seed/sarah-fiftysix/900/1200",
};

const PORTRAIT_AGES = [32, 38, 45, 52, 56];

export function pickPortraitAge(age: number): number {
  return PORTRAIT_AGES.reduce(
    (best, a) => (Math.abs(a - age) < Math.abs(best - age) ? a : best),
    PORTRAIT_AGES[0],
  );
}

export type PortraitMood = "dim" | "neutral" | "warm" | "cool" | "golden";

interface PortraitProps {
  age?: number;
  mood?: PortraitMood;
  className?: string;
  style?: CSSProperties;
  fadeKey?: string | number;
  blurred?: boolean;
}

export function Portrait({
  age = 52,
  mood = "dim",
  className = "",
  style,
  fadeKey,
  blurred = false,
}: PortraitProps) {
  const portraitAge = pickPortraitAge(age);
  const src = PORTRAITS[portraitAge];
  return (
    <div className={`portrait ${mood} ${className}`} style={style}>
      <svg
        viewBox="0 0 100 130"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.7,
        }}
      >
        <defs>
          <radialGradient id="fg" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#3a342c" />
            <stop offset="100%" stopColor="#0a0908" />
          </radialGradient>
        </defs>
        <rect width="100" height="130" fill="url(#fg)" />
        <circle cx="50" cy="48" r="18" fill="#1c1814" />
        <path d="M20 130 Q20 90 50 88 Q80 90 80 130 Z" fill="#1c1814" />
      </svg>
      <img
        key={fadeKey ?? portraitAge}
        src={src}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          animation: "fade-in-slow 900ms var(--ease) both",
          // Blur when no selfie was uploaded — don't show a random stock face as "you".
          filter: blurred ? "blur(28px) saturate(0.7)" : undefined,
          transform: blurred ? "scale(1.08)" : undefined,
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

interface MetaProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function Meta({ children, style }: MetaProps) {
  return (
    <div className="meta" style={style}>
      {children}
    </div>
  );
}

type CornerPos = "tl" | "tr" | "bl" | "br";

const CORNER_STYLES: Record<CornerPos, CSSProperties> = {
  tl: { top: 28, left: 32 },
  tr: { top: 28, right: 32 },
  bl: { bottom: 28, left: 32 },
  br: { bottom: 28, right: 32 },
};

export function CornerLabel({ pos, children }: { pos: CornerPos; children: ReactNode }) {
  return (
    <div className="corner" style={CORNER_STYLES[pos]}>
      {children}
    </div>
  );
}

export function Mark() {
  return <span className="mark">AlterEgo</span>;
}

export function Wave({ style }: { style?: CSSProperties }) {
  return (
    <div className="wave" aria-hidden style={style}>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function useStreamedText(
  full: string,
  speedMs = 22,
  start = true,
  onDone?: () => void,
): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!start) {
      setText("");
      return;
    }
    setText("");
    let i = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      if (i >= full.length) {
        if (!cancelled) onDone?.();
        return;
      }
      const chunk = 1 + Math.floor(Math.random() * 2);
      i = Math.min(full.length, i + chunk);
      setText(full.slice(0, i));
      const ch = full[i - 1];
      const delay =
        ch === "." || ch === "?" || ch === "!"
          ? speedMs * 14
          : ch === "," || ch === ";"
            ? speedMs * 6
            : speedMs;
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 200);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // onDone intentionally excluded; restarting on a fresh callback identity would re-stream the same text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, start, speedMs]);
  return text;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
