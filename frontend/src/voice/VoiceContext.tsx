import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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
  const samplesRef = useRef<Blob[]>([]);
  const [, bumpSamples] = useState(0);
  const secondsRef = useRef(0);

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
    samplesRef.current.push(b);
    bumpSamples((n) => n + 1);
  }, []);

  const clearIntakeSamples = useCallback(() => {
    samplesRef.current = [];
    secondsRef.current = 0;
    bumpSamples((n) => n + 1);
  }, []);

  const pushIntakeSeconds = useCallback((sec: number) => {
    secondsRef.current += sec;
  }, []);

  const value = useMemo<VoiceState>(
    () => ({
      voiceMode,
      setVoiceMode,
      primed,
      prime,
      clonedVoiceId,
      setClonedVoiceId,
      intakeSamples: samplesRef.current,
      pushIntakeSample,
      clearIntakeSamples,
      intakeSamplesSeconds: secondsRef.current,
      pushIntakeSeconds,
    }),
    [
      voiceMode,
      setVoiceMode,
      primed,
      prime,
      clonedVoiceId,
      pushIntakeSample,
      clearIntakeSamples,
      pushIntakeSeconds,
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
