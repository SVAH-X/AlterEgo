import { useCallback, useEffect, useRef, useState } from "react";
import { stt } from "../lib/voice";
import { useMicRecorder } from "./useMicRecorder";

interface MicButtonProps {
  onTranscript: (text: string) => void;
  onRecorded?: (blob: Blob, durationMs: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  title?: string;
}

/** Click to start, click again to stop. While recording, the ring
 *  pulses with the live mic level. On stop we POST the blob to /stt
 *  and pass the transcript back via onTranscript.
 */
export function MicButton({
  onTranscript,
  onRecorded,
  disabled,
  size = "md",
  title = "Speak your answer",
}: MicButtonProps) {
  const { recording, level, start, stop, permissionDenied } = useMicRecorder();
  const [pending, setPending] = useState(false);
  const startingRef = useRef(false);

  const click = useCallback(async () => {
    if (disabled || pending) return;
    if (!recording) {
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        await start();
      } catch {
        // permission denied or other; useMicRecorder records the flag
      } finally {
        startingRef.current = false;
      }
      return;
    }
    setPending(true);
    let result: { blob: Blob; durationMs: number } | null = null;
    try {
      result = await stop();
    } catch (e) {
      console.warn("recorder stop failed:", e);
    }
    if (!result || result.durationMs < 300) {
      // ignore accidental taps
      setPending(false);
      return;
    }
    onRecorded?.(result.blob, result.durationMs);
    try {
      const text = await stt(result.blob);
      if (text.trim()) onTranscript(text.trim());
    } catch (e) {
      console.warn("stt failed:", e);
    } finally {
      setPending(false);
    }
  }, [disabled, pending, recording, start, stop, onRecorded, onTranscript]);

  // glow size driven by mic level so the ring breathes with speech
  const glow = recording ? 0.4 + level * 0.6 : 0;

  const aria = recording
    ? "Stop recording"
    : pending
      ? "Transcribing"
      : title;

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled || permissionDenied}
      className={`mic-btn ${size} ${recording ? "rec" : ""} ${pending ? "pending" : ""}`}
      title={permissionDenied ? "Microphone permission denied" : aria}
      aria-label={aria}
      style={
        {
          // CSS custom prop drives the live glow
          ["--mic-glow" as string]: glow.toFixed(3),
        } as React.CSSProperties
      }
    >
      <MicIcon />
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        fill="currentColor"
      />
      <path
        d="M5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Small helper to suppress mic UI completely when voice mode is off. */
export function useReadyMic() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);
  return ready;
}
