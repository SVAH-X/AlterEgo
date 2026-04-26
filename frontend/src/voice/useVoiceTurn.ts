import { useCallback, useRef, useState } from "react";
import { transcribe } from "../lib/voice";
import { useAutoListen } from "./useAutoListen";
import { useTTSPlayer } from "./useTTSPlayer";

export type TurnState =
  | "idle"
  | "speaking"
  | "listening"
  | "transcribing"
  | "showing"
  | "reprompting"
  | "fallback";

export interface TurnResult {
  transcript: string | null;
  blob: Blob | null;
  durationMs: number;
  /** True when the turn ended without producing a usable transcript (after reprompt). */
  fellBack: boolean;
}

interface VoiceTurn {
  state: TurnState;
  level: number;
  liveTranscript: string;
  permissionDenied: boolean;
  /** Run one TTS-ask → listen → STT cycle. The state stays at "showing"
   *  with `liveTranscript` populated until reset() is called — the caller
   *  is responsible for confirming or redoing. */
  runTurn: (
    promptText: string,
    options?: { reprompt?: string },
  ) => Promise<TurnResult>;
  /** Clear the showing/fallback state back to idle. */
  reset: () => void;
  abort: () => void;
}

const DEFAULT_REPROMPT = "Sorry, I didn't catch that. Could you say it again?";

export function useVoiceTurn(): VoiceTurn {
  const tts = useTTSPlayer();
  const listener = useAutoListen();
  const [state, setState] = useState<TurnState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const abortedRef = useRef(false);

  const abort = useCallback(() => {
    abortedRef.current = true;
    tts.stop();
    void listener.stop();
    setState("idle");
    setLiveTranscript("");
  }, [tts, listener]);

  const reset = useCallback(() => {
    setState("idle");
    setLiveTranscript("");
  }, []);

  const runTurn = useCallback(
    async (
      promptText: string,
      options?: { reprompt?: string },
    ): Promise<TurnResult> => {
      abortedRef.current = false;
      setLiveTranscript("");

      const tryOnce = async (): Promise<{
        transcript: string | null;
        blob: Blob | null;
        durationMs: number;
      }> => {
        if (abortedRef.current) return { transcript: null, blob: null, durationMs: 0 };
        setState("listening");
        const heard = await listener.listen();
        if (abortedRef.current) return { transcript: null, blob: null, durationMs: 0 };
        if (!heard.blob || heard.reason === "no-speech" || heard.reason === "denied") {
          return { transcript: null, blob: heard.blob, durationMs: heard.durationMs };
        }
        setState("transcribing");
        const transcript = await transcribe(heard.blob);
        return { transcript, blob: heard.blob, durationMs: heard.durationMs };
      };

      setState("speaking");
      await tts.playAndWait(promptText);
      if (abortedRef.current) {
        setState("idle");
        return { transcript: null, blob: null, durationMs: 0, fellBack: true };
      }

      let attempt = await tryOnce();
      if (!attempt.transcript && !abortedRef.current) {
        setState("reprompting");
        await tts.playAndWait(options?.reprompt ?? DEFAULT_REPROMPT);
        if (abortedRef.current) {
          setState("idle");
          return { transcript: null, blob: null, durationMs: 0, fellBack: true };
        }
        attempt = await tryOnce();
      }

      if (!attempt.transcript) {
        setState("fallback");
        return { transcript: null, blob: attempt.blob, durationMs: attempt.durationMs, fellBack: true };
      }

      setLiveTranscript(attempt.transcript);
      setState("showing");
      // Stay at "showing" — the caller drives confirm/redo via reset().
      return { transcript: attempt.transcript, blob: attempt.blob, durationMs: attempt.durationMs, fellBack: false };
    },
    [tts, listener],
  );

  return {
    state,
    level: listener.level,
    liveTranscript,
    permissionDenied: listener.permissionDenied,
    runTurn,
    reset,
    abort,
  };
}
