import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

interface VoiceState {
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
  /** True once the user has clicked the voice toggle in this session.
   *  Required before auto-play is allowed (browser autoplay policy). */
  primed: boolean;
  prime: () => void;
  clonedVoiceId: string | null;
  setClonedVoiceId: (id: string | null) => void;
  intakeSamples: Blob[];
  pushIntakeSample: (b: Blob) => void;
  clearIntakeSamples: () => void;
  /** Total recorded duration across intakeSamples in seconds. */
  intakeSamplesSeconds: number;
  pushIntakeSeconds: (sec: number) => void;
  /** Voice-only hands-free intake vs. typed intake. null = user has not chosen yet. */
  inputMode: "voice" | "typing" | null;
  setInputMode: (m: "voice" | "typing" | null) => void;
}

const VoiceCtx = createContext<VoiceState | null>(null);

const STORAGE_KEY = "alterego.voiceMode";

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [voiceMode, setVoiceModeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [primed, setPrimed] = useState(false);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [intakeSamples, setIntakeSamples] = useState<Blob[]>([]);
  const [intakeSamplesSeconds, setIntakeSamplesSeconds] = useState(0);
  const [inputMode, setInputMode] = useState<"voice" | "typing" | null>(null);

  const setVoiceMode = useCallback((v: boolean) => {
    setVoiceModeState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const prime = useCallback(() => setPrimed(true), []);

  const pushIntakeSample = useCallback((b: Blob) => {
    setIntakeSamples((prev) => [...prev, b]);
  }, []);

  const clearIntakeSamples = useCallback(() => {
    setIntakeSamples([]);
    setIntakeSamplesSeconds(0);
  }, []);

  const pushIntakeSeconds = useCallback((sec: number) => {
    setIntakeSamplesSeconds((prev) => prev + sec);
  }, []);

  const value = useMemo<VoiceState>(
    () => ({
      voiceMode,
      setVoiceMode,
      primed,
      prime,
      clonedVoiceId,
      setClonedVoiceId,
      intakeSamples,
      pushIntakeSample,
      clearIntakeSamples,
      intakeSamplesSeconds,
      pushIntakeSeconds,
      inputMode,
      setInputMode,
    }),
    [
      voiceMode,
      setVoiceMode,
      primed,
      prime,
      clonedVoiceId,
      intakeSamples,
      pushIntakeSample,
      clearIntakeSamples,
      intakeSamplesSeconds,
      pushIntakeSeconds,
      inputMode,
      setInputMode,
    ],
  );

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}

export function useVoice(): VoiceState {
  const ctx = useContext(VoiceCtx);
  if (!ctx) throw new Error("useVoice must be used inside <VoiceProvider>");
  return ctx;
}

/** Returns true once the user has clicked the voice toggle this session.
 *  Auto-play should gate on this to satisfy browser autoplay policy. */
export function useVoicePrimed(): boolean {
  return useVoice().primed;
}
