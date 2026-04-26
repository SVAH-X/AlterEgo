import { useCallback, useEffect, useRef, useState } from "react";
import { useMicRecorder } from "./useMicRecorder";

export interface AutoListenResult {
  blob: Blob | null;
  durationMs: number;
  reason: "silence" | "ceiling" | "manual" | "no-speech" | "denied";
}

interface AutoListen {
  isListening: boolean;
  level: number;
  permissionDenied: boolean;
  /** Begin a hands-free turn. Resolves once the recorder stops via VAD,
   *  the 30s ceiling, or stop(). */
  listen: () => Promise<AutoListenResult>;
  /** Force-stop the current turn (e.g., user switched to typing). */
  stop: () => Promise<void>;
}

const VOICE_THRESHOLD = 0.08;
const SILENCE_MS = 1500;
const MIN_SPEECH_MS = 400;
const MAX_TURN_MS = 30_000;

export function useAutoListen(): AutoListen {
  const recorder = useMicRecorder();
  const [isListening, setIsListening] = useState(false);

  // Mirror the recorder's live `level` into a ref so the RAF tick reads the
  // latest value rather than a stale closure capture from when listen() was
  // invoked. This re-runs on every render the parent does — and `setLevel`
  // inside useMicRecorder triggers exactly those renders.
  const levelRef = useRef(recorder.level);
  levelRef.current = recorder.level;

  const rafRef = useRef<number | null>(null);
  const stopReasonRef = useRef<AutoListenResult["reason"] | null>(null);
  const stopRecorderRef = useRef<(() => Promise<void>) | null>(null);

  const cancelLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    if (!stopRecorderRef.current) return;
    stopReasonRef.current = stopReasonRef.current ?? "manual";
    cancelLoop();
    await stopRecorderRef.current();
  }, [cancelLoop]);

  const listen = useCallback(async (): Promise<AutoListenResult> => {
    try {
      await recorder.start();
    } catch {
      // useMicRecorder sets permissionDenied internally on this throw.
      return { blob: null, durationMs: 0, reason: "denied" };
    }
    setIsListening(true);
    stopReasonRef.current = null;

    const startedAt = performance.now();
    let hasSpoken = false;
    let lastVoiceAt = startedAt;

    let finishResolver: ((r: AutoListenResult) => void) | null = null;
    const finishPromise = new Promise<AutoListenResult>((res) => {
      finishResolver = res;
    });

    stopRecorderRef.current = async () => {
      cancelLoop();
      const result = await recorder.stop();
      stopRecorderRef.current = null;
      setIsListening(false);
      const reason = stopReasonRef.current ?? "manual";
      if (!result) {
        finishResolver?.({
          blob: null,
          durationMs: 0,
          reason: hasSpoken ? reason : "no-speech",
        });
        return;
      }
      finishResolver?.({
        blob: result.blob,
        durationMs: result.durationMs,
        reason: hasSpoken ? reason : "no-speech",
      });
    };

    const tick = () => {
      const now = performance.now();
      const lvl = levelRef.current;
      if (lvl > VOICE_THRESHOLD) {
        lastVoiceAt = now;
        if (!hasSpoken) hasSpoken = true;
      }
      if (now - startedAt > MAX_TURN_MS) {
        stopReasonRef.current = "ceiling";
        void stopRecorderRef.current?.();
        return;
      }
      if (
        hasSpoken &&
        now - startedAt >= MIN_SPEECH_MS &&
        now - lastVoiceAt > SILENCE_MS
      ) {
        stopReasonRef.current = "silence";
        void stopRecorderRef.current?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return finishPromise;
  }, [recorder, cancelLoop]);

  useEffect(() => {
    return () => {
      cancelLoop();
    };
  }, [cancelLoop]);

  return {
    isListening,
    level: recorder.level,
    permissionDenied: recorder.permissionDenied,
    listen,
    stop,
  };
}
