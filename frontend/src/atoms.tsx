import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

interface PortraitProps {
  className?: string;
  style?: CSSProperties;
}

export function Portrait({ className = "", style }: PortraitProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(20, 16, 12, 0.4)",
        border: "1px dashed var(--line-soft)",
        borderRadius: 8,
        color: "var(--ink-2)",
        overflow: "hidden",
        ...style,
      }}
    >
      <svg
        viewBox="0 0 240 80"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "62%", maxWidth: 240, opacity: 0.55 }}
        aria-label="placeholder image"
      >
        <line x1="0" y1="0" x2="240" y2="80" stroke="currentColor" strokeOpacity="0.18" />
        <line x1="240" y1="0" x2="0" y2="80" stroke="currentColor" strokeOpacity="0.18" />
        <text
          x="120"
          y="46"
          textAnchor="middle"
          fontFamily="var(--mono, monospace)"
          fontSize="11"
          letterSpacing="3"
          fill="currentColor"
        >
          PLACEHOLDER IMAGE
        </text>
      </svg>
    </div>
  );
}

interface PortraitImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
}

// Renders the real portrait when we have a URL; falls back to the placeholder
// SVG if the URL is missing OR the image fails to load.
export function PortraitImage({ src, alt, className, style }: PortraitImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    setFailedSrc(null);
  }, [src]);
  if (!src || failedSrc === src) {
    return <Portrait className={className} style={style} />;
  }
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      onError={() => setFailedSrc(src)}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: 8,
        animation: "fade-in-slow 700ms var(--ease) both",
        ...style,
      }}
    />
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

export function Mark({ onClick }: { onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        className="mark mark-link"
        onClick={onClick}
        aria-label="Go to home screen"
      >
        AlterEgo
      </button>
    );
  }
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
