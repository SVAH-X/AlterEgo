import { useCallback, useEffect, useRef, useState } from "react";
import { stt } from "../lib/voice";
import { useMicRecorder } from "./useMicRecorder";

interface MicButtonProps {
  onTranscript: (text: string) => void;
  onRecorded?: (blob: Blob, durationMs: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  title?: string;
  showStatus?: boolean;
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
  showStatus = false,
}: MicButtonProps) {
  const { recording, level, start, stop, permissionDenied } = useMicRecorder();
  const [pending, setPending] = useState(false);
  const startingRef = useRef(false);
  const pointerHeldRef = useRef(false);
  const hotkeyHeldRef = useRef(false);
  const spaceDownRef = useRef(false);
  const mDownRef = useRef(false);

  const startRecording = useCallback(async () => {
    if (disabled || pending || recording) return;
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      await start();
    } catch {
      // permission denied or other; useMicRecorder records the flag
    } finally {
      startingRef.current = false;
    }
  }, [disabled, pending, recording, start]);

  const stopRecording = useCallback(async () => {
    if (!recording || pending) return;
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
  }, [recording, pending, stop, onRecorded, onTranscript]);

  useEffect(() => {
    const bothDown = () => spaceDownRef.current && mDownRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = true;
      if (e.code === "KeyM") mDownRef.current = true;
      if (bothDown() && !hotkeyHeldRef.current) {
        hotkeyHeldRef.current = true;
        e.preventDefault();
        void startRecording();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = false;
      if (e.code === "KeyM") mDownRef.current = false;
      if (hotkeyHeldRef.current && !bothDown()) {
        hotkeyHeldRef.current = false;
        e.preventDefault();
        void stopRecording();
      }
    };

    const onBlur = () => {
      spaceDownRef.current = false;
      mDownRef.current = false;
      if (hotkeyHeldRef.current) {
        hotkeyHeldRef.current = false;
        void stopRecording();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [startRecording, stopRecording]);

  // glow size driven by mic level so the ring breathes with speech
  const glow = recording ? 0.4 + level * 0.6 : 0;

  const aria = recording
    ? "Stop recording"
    : pending
      ? "Transcribing"
      : title;

  const statusText = permissionDenied
    ? "Mic permission denied"
    : pending
      ? "Transcribing..."
      : recording
        ? "Listening..."
        : "Hold button or Space+M";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onPointerDown={(e) => {
          if (disabled || pending || permissionDenied) return;
          pointerHeldRef.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          void startRecording();
        }}
        onPointerUp={() => {
          if (!pointerHeldRef.current) return;
          pointerHeldRef.current = false;
          void stopRecording();
        }}
        onPointerCancel={() => {
          if (!pointerHeldRef.current) return;
          pointerHeldRef.current = false;
          void stopRecording();
        }}
        onContextMenu={(e) => e.preventDefault()}
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
      {showStatus && (
        <span className="meta" style={{ color: "var(--ink-3)", fontSize: 10 }}>
          {statusText}
        </span>
      )}
    </div>
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
