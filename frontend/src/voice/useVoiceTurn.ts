import { useCallback, useRef, useState } from "react";
import { stt } from "../lib/voice";
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
  /** True when the turn ended without producing a usable transcript (after reprompt). */
  fellBack: boolean;
}

interface VoiceTurn {
  state: TurnState;
  level: number;
  liveTranscript: string;
  permissionDenied: boolean;
  /** Run one TTS-ask → listen → STT cycle. */
  runTurn: (
    promptText: string,
    options?: { reprompt?: string },
  ) => Promise<TurnResult>;
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
  }, [tts, listener]);

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
      }> => {
        if (abortedRef.current) return { transcript: null, blob: null };
        setState("listening");
        const heard = await listener.listen();
        if (abortedRef.current) return { transcript: null, blob: null };
        if (!heard.blob || heard.reason === "no-speech" || heard.reason === "denied") {
          return { transcript: null, blob: heard.blob };
        }
        setState("transcribing");
        try {
          const text = await stt(heard.blob);
          return { transcript: text.trim() || null, blob: heard.blob };
        } catch (e) {
          console.warn("stt failed:", e);
          return { transcript: null, blob: heard.blob };
        }
      };

      setState("speaking");
      await tts.playAndWait(promptText);
      if (abortedRef.current) {
        setState("idle");
        return { transcript: null, blob: null, fellBack: true };
      }

      let attempt = await tryOnce();
      if (!attempt.transcript && !abortedRef.current) {
        setState("reprompting");
        await tts.playAndWait(options?.reprompt ?? DEFAULT_REPROMPT);
        if (abortedRef.current) {
          setState("idle");
          return { transcript: null, blob: null, fellBack: true };
        }
        attempt = await tryOnce();
      }

      if (!attempt.transcript) {
        setState("fallback");
        return { transcript: null, blob: attempt.blob, fellBack: true };
      }

      setLiveTranscript(attempt.transcript);
      setState("showing");
      await new Promise((r) => setTimeout(r, 800));
      setState("idle");
      return { transcript: attempt.transcript, blob: attempt.blob, fellBack: false };
    },
    [tts, listener],
  );

  return {
    state,
    level: listener.level,
    liveTranscript,
    permissionDenied: listener.permissionDenied,
    runTurn,
    abort,
  };
}
