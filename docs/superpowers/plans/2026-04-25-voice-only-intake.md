# Voice-Only Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a "Speak it / Type it" mode-select screen after the selfie. In Speak mode, the intake runs hands-free: TTS reads each question, mic auto-opens after TTS ends, and 1.5s of silence auto-submits the transcript and advances.

**Architecture:** Add two new hooks (`useAutoListen` for VAD, `useVoiceTurn` to orchestrate TTS→listen→STT per question), one new screen (`ScreenModeSelect`), and a voice-mode branch inside the existing `ScreenIntake`. No backend changes — `/tts`, `/stt`, `/voice/clone` already exist. State machine per question: SPEAKING → LISTENING → TRANSCRIBING → SHOWING → ADVANCE, with a REPROMPTING failure branch and a per-field FALLBACK to typing.

**Tech Stack:** React 18 + TypeScript + Vite. Browser MediaRecorder + AudioContext for capture and RMS levels (already used by `useMicRecorder`). ElevenLabs `/tts` and `/stt` via existing `frontend/src/lib/voice.ts` helpers.

**Verification:** This frontend has no unit-test runner (only `tsc -b --noEmit` and `vite build`). Each task ends with `npm run typecheck` from `frontend/`. The final task is a manual smoke test in the dev server.

---

## File Map

**New:**
- `frontend/src/voice/useAutoListen.ts` — VAD hook wrapping `useMicRecorder`.
- `frontend/src/voice/useVoiceTurn.ts` — Per-question state machine.
- `frontend/src/screens/screen-mode-select.tsx` — Speak/Type fork screen.

**Modified:**
- `frontend/src/voice/useTTSPlayer.ts` — Add `playAndWait(text)` that resolves on `audio.onended`.
- `frontend/src/voice/VoiceContext.tsx` — Add `inputMode: "voice" | "typing" | null`.
- `frontend/src/screens/screens-a.tsx` — `ScreenIntake` voice-mode branch + switch-to-typing button + `ScreenHealth` TTS read-aloud.
- `frontend/src/App.tsx` — Insert `ScreenModeSelect` at index 2.

---

## Task 1: Add `playAndWait` to `useTTSPlayer`

`useVoiceTurn` needs to know exactly when TTS playback ends so it can open the mic. The current `play()` resolves when playback *starts*. Add a sibling method `playAndWait(text, voiceId?)` that resolves when `audio.onended` fires (or rejects on error/abort).

**Files:**
- Modify: `frontend/src/voice/useTTSPlayer.ts`

- [ ] **Step 1: Update the `TTSPlayer` interface and add the method**

Replace the entire contents of `frontend/src/voice/useTTSPlayer.ts` with:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { ttsBlobUrl } from "../lib/voice";

interface TTSPlayer {
  playing: boolean;
  loading: boolean;
  play: (text: string, voiceId?: string) => Promise<void>;
  /** Resolves when audio finishes playing (onended), or when stopped/aborted. */
  playAndWait: (text: string, voiceId?: string) => Promise<void>;
  stop: () => void;
}

export function useTTSPlayer(): TTSPlayer {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endedResolversRef = useRef<Array<() => void>>([]);

  const cleanup = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const flushEndedResolvers = useCallback(() => {
    const resolvers = endedResolversRef.current;
    endedResolversRef.current = [];
    resolvers.forEach((r) => r());
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
    }
    audioRef.current = null;
    cleanup();
    setPlaying(false);
    setLoading(false);
    flushEndedResolvers();
  }, [cleanup, flushEndedResolvers]);

  const play = useCallback(
    async (text: string, voiceId?: string) => {
      stop();
      if (!text.trim()) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      let url: string;
      try {
        url = await ttsBlobUrl(text, voiceId, ac.signal);
      } catch (e) {
        setLoading(false);
        if ((e as { name?: string }).name === "AbortError") return;
        console.warn("tts failed:", e);
        flushEndedResolvers();
        return;
      }
      if (ac.signal.aborted) {
        URL.revokeObjectURL(url);
        flushEndedResolvers();
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;
      audio.onended = () => {
        setPlaying(false);
        cleanup();
        flushEndedResolvers();
      };
      audio.onerror = () => {
        setPlaying(false);
        cleanup();
        flushEndedResolvers();
      };
      try {
        await audio.play();
        setPlaying(true);
      } catch (e) {
        console.warn("audio.play() rejected:", e);
        cleanup();
        flushEndedResolvers();
      } finally {
        setLoading(false);
      }
    },
    [stop, cleanup, flushEndedResolvers],
  );

  const playAndWait = useCallback(
    async (text: string, voiceId?: string) => {
      const waitForEnd = new Promise<void>((resolve) => {
        endedResolversRef.current.push(resolve);
      });
      await play(text, voiceId);
      await waitForEnd;
    },
    [play],
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { playing, loading, play, playAndWait, stop };
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/voice/useTTSPlayer.ts
git commit -m "feat(voice): add playAndWait to useTTSPlayer for turn-taking"
```

---

## Task 2: Extend `VoiceContext` with `inputMode`

`voiceMode` already exists and gates TTS playback for chat replies. Add a separate `inputMode` flag that gates auto-listen during intake. They are distinct: `voiceMode=true, inputMode="typing"` is a valid combination (chat replies are spoken, but the user typed the intake).

**Files:**
- Modify: `frontend/src/voice/VoiceContext.tsx`

- [ ] **Step 1: Add `inputMode` to the `VoiceState` interface and provider**

Edit `frontend/src/voice/VoiceContext.tsx`. Add to the `VoiceState` interface, just below `clearIntakeSamples`:

```typescript
  /** Voice-only hands-free intake vs. typed intake. null = user has not chosen yet. */
  inputMode: "voice" | "typing" | null;
  setInputMode: (m: "voice" | "typing" | null) => void;
```

In the `VoiceProvider` body, add after the `intakeSamplesSeconds` state declaration:

```typescript
  const [inputMode, setInputMode] = useState<"voice" | "typing" | null>(null);
```

In the `useMemo` value object, add `inputMode` and `setInputMode` to both the returned object and the dependency array (next to `voiceMode`).

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/voice/VoiceContext.tsx
git commit -m "feat(voice): add inputMode to VoiceContext"
```

---

## Task 3: Create `useAutoListen` VAD hook

Wraps `useMicRecorder` with a silence-detection loop. Starts recording, polls the existing `level` value via `requestAnimationFrame`, and fires `onSilence` (a callback you supply at start) once the user has spoken for ≥400ms and then been silent for ≥1500ms. Hard 30s ceiling.

The hook does NOT call `/stt` itself — it returns the recorded `Blob` via the same `onSilence` callback so the orchestrator (`useVoiceTurn`) can decide what to do with it.

**Files:**
- Create: `frontend/src/voice/useAutoListen.ts`

- [ ] **Step 1: Create the hook**

Write `frontend/src/voice/useAutoListen.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/voice/useAutoListen.ts
git commit -m "feat(voice): add useAutoListen VAD hook"
```

---

## Task 4: Create `useVoiceTurn` orchestrator

Composes `useTTSPlayer.playAndWait` + `useAutoListen.listen` + `stt()` into the per-question state machine. Exposes a single `runTurn(promptText)` that returns `{ transcript, blob, error }`. One reprompt on empty/failed transcript, then surfaces an error so the caller can fall back to typing.

**Files:**
- Create: `frontend/src/voice/useVoiceTurn.ts`

- [ ] **Step 1: Create the hook**

Write `frontend/src/voice/useVoiceTurn.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/voice/useVoiceTurn.ts
git commit -m "feat(voice): add useVoiceTurn orchestrator"
```

---

## Task 5: Create `ScreenModeSelect`

The single-gesture handshake. Two large buttons: "Speak it" and "Type it". Speak path requests mic permission and calls `tts.play("")` to prime audio (an empty payload is rejected by the backend, but the user gesture itself unlocks browser autoplay — we instead prime with a short greeting).

On mic-permission denial it shows a one-line error and falls through to typing.

**Files:**
- Create: `frontend/src/screens/screen-mode-select.tsx`

- [ ] **Step 1: Create the screen**

Write `frontend/src/screens/screen-mode-select.tsx`:

```typescript
import { useState } from "react";
import type { ScreenProps } from "../App";
import { Mark } from "../atoms";
import { useVoice } from "../voice/VoiceContext";

export function ScreenModeSelect({ onContinue, onJumpTo }: ScreenProps) {
  const { setInputMode, setVoiceMode, prime } = useVoice();
  const [denied, setDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function chooseSpeak() {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only needed the permission grant; release the tracks immediately.
      stream.getTracks().forEach((t) => t.stop());
      prime();
      setVoiceMode(true);
      setInputMode("voice");
      onContinue();
    } catch {
      setDenied(true);
    } finally {
      setRequesting(false);
    }
  }

  function chooseType() {
    setInputMode("typing");
    onContinue();
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
          padding: "0 40px",
          textAlign: "center",
        }}
      >
        <h2
          className="serif"
          style={{ fontSize: 32, lineHeight: 1.25, margin: 0, maxWidth: 600 }}
        >
          How do you want to do this?
        </h2>
        <p
          className="muted"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          choose one · you can switch later
        </p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="btn btn-accent"
            onClick={chooseSpeak}
            disabled={requesting}
            style={{ minWidth: 200, padding: "16px 28px", fontSize: 16 }}
          >
            {requesting ? "Asking your mic…" : "Speak it →"}
          </button>
          <button
            className="btn"
            onClick={chooseType}
            style={{ minWidth: 200, padding: "16px 28px", fontSize: 16 }}
          >
            Type it →
          </button>
        </div>
        {denied && (
          <p
            className="muted"
            style={{
              color: "var(--ink-2)",
              maxWidth: 420,
              fontFamily: "var(--mono)",
              fontSize: 12,
              margin: 0,
            }}
          >
            Mic permission denied. You can continue by typing.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/screen-mode-select.tsx
git commit -m "feat(intake): add ScreenModeSelect speak/type fork"
```

---

## Task 6: Wire `ScreenModeSelect` into `App.tsx`

Insert the new screen between `selfie` and `intake` (it becomes index 2; `intake`, `health`, `processing`, etc. all shift down by one).

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the import**

In `frontend/src/App.tsx`, add this import next to the other screen imports:

```typescript
import { ScreenModeSelect } from "./screens/screen-mode-select";
```

- [ ] **Step 2: Insert into the SCREENS array**

Replace the existing `SCREENS` constant with:

```typescript
const SCREENS: ScreenDef[] = [
  { key: "landing", component: ScreenLanding, label: "01 cold open" },
  { key: "selfie", component: ScreenSelfie, label: "02 selfie" },
  { key: "modeSelect", component: ScreenModeSelect, label: "03 mode" },
  { key: "intake", component: ScreenIntake, label: "04 intake" },
  { key: "health", component: ScreenHealth, label: "05 health" },
  { key: "processing", component: ScreenProcessing, label: "06 processing" },
  { key: "reveal", component: ScreenReveal, label: "07 reveal" },
  { key: "timeline", component: ScreenTimeline, label: "08 timeline" },
  { key: "chat", component: ScreenChat, label: "09 chat" },
  { key: "end", component: ScreenEnd, label: "10 end" },
];
```

- [ ] **Step 3: Reset `inputMode` on restart**

In the `restart()` function, just after `clearIntakeSamples();`, add:

```typescript
    setInputMode(null);
```

And update the `useVoice()` destructuring at the top of `App()` to include `setInputMode`:

```typescript
  const { clonedVoiceId, setClonedVoiceId, clearIntakeSamples, setInputMode } = useVoice();
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(intake): wire ScreenModeSelect between selfie and intake"
```

---

## Task 7: Voice-mode branch in `ScreenIntake`

When `inputMode === "voice"` and the current field is `text | number | textarea`, render the field as a state ring + transcript display rather than a text input. Drive it via `useVoiceTurn`. After each successful turn, call `applyValue(transcript, "voice")` and `next()`.

When the field is `mbti | dyads`, TTS reads the label aloud via `playAndWait`, but the existing button UI is preserved (no auto-listen).

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx` (`ScreenIntake` only)

- [ ] **Step 1: Add imports**

At the top of `frontend/src/screens/screens-a.tsx`, add:

```typescript
import { useVoiceTurn } from "../voice/useVoiceTurn";
```

- [ ] **Step 2: Replace the `ScreenIntake` body**

Replace the current `export function ScreenIntake(...)` (currently lines 561–800) with the following implementation. It keeps the typed-mode behavior intact when `inputMode !== "voice"` and adds a voice-mode branch when it is.

```typescript
export function ScreenIntake({ onContinue, onJumpTo, profile, setProfile, pushVoiceSample }: ScreenProps) {
  const [step, setStep] = useState(0);
  const cur = INTAKE_FIELDS[step];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    voiceMode,
    setVoiceMode,
    prime,
    pushIntakeSample,
    pushIntakeSeconds,
    inputMode,
    setInputMode,
  } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();
  const turn = useVoiceTurn();

  // Per-step fallback latch: if a voice turn fell back to typing for THIS
  // question, freeze it as a typed input until the user advances.
  const [forceTypedField, setForceTypedField] = useState(false);

  const isVoice = inputMode === "voice" && !forceTypedField;
  const isSpeechField =
    cur.type === "text" || cur.type === "number" || cur.type === "textarea";

  // Reset the per-field fallback latch when the step changes.
  useEffect(() => {
    setForceTypedField(false);
  }, [step]);

  // Typed-mode TTS: read the label aloud (existing behavior preserved).
  useEffect(() => {
    if (inputMode === "voice") return; // voice mode owns its own TTS via runTurn
    if (voiceMode && voicePrimed) tts.play(cur.label);
    else tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, voiceMode, voicePrimed, inputMode]);

  // Voice-mode driver: run one turn per step; on success, applyValue + next().
  // For non-speech fields (mbti/dyads), read the label via TTS but don't listen.
  useEffect(() => {
    if (inputMode !== "voice") return;
    let cancelled = false;

    (async () => {
      if (!isSpeechField) {
        await tts.playAndWait(cur.label);
        return;
      }
      const result = await turn.runTurn(cur.label);
      if (cancelled) return;
      if (result.blob) {
        pushVoiceSample(result.blob);
        pushIntakeSample(result.blob);
        pushIntakeSeconds(result.blob.size / 16000); // rough; size-based estimate
        prime();
      }
      if (result.fellBack) {
        setForceTypedField(true);
        return;
      }
      if (result.transcript) {
        applyValue(result.transcript, "voice");
        // Wait one tick so React commits the new value before advancing.
        setTimeout(() => {
          if (!cancelled) advance();
        }, 50);
      }
    })();

    return () => {
      cancelled = true;
      turn.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, inputMode]);

  function advance() {
    tts.stop();
    if (step < INTAKE_FIELDS.length - 1) setStep(step + 1);
    else onContinue();
  }

  function next() {
    if (cur.type === "dyads") {
      const picks = profile.values ?? {};
      const allAnswered = cur.dyads.every((d) => Boolean(picks[d.slug]));
      if (!allAnswered) return;
    }
    advance();
  }

  const isYearsAheadField = cur.key === "targetYear";
  const value = isYearsAheadField
    ? Math.max(0, profile.targetYear - profile.presentYear)
    : profile[cur.key];

  function applyValue(raw: string, source: "type" | "voice") {
    if (cur.type !== "number") {
      setProfile({ ...profile, [cur.key]: raw });
      return;
    }
    let n: number;
    if (source === "voice") {
      const parsed = parseSpokenInteger(raw);
      if (parsed === null) return;
      n = parsed;
    } else {
      const digits = raw.replace(/[^0-9]/g, "");
      n = digits === "" ? 0 : Number(digits);
    }
    if (isYearsAheadField) {
      setProfile({
        ...profile,
        targetYear: profile.presentYear + (Number.isFinite(n) ? n : 0),
      });
    } else {
      setProfile({ ...profile, [cur.key]: Number.isFinite(n) ? n : 0 });
    }
  }

  const displayValue =
    cur.type === "mbti" || cur.type === "dyads"
      ? ""
      : cur.type === "number"
        ? value && Number(value) !== 0
          ? String(value)
          : ""
        : ((value as string | undefined) ?? "");

  useEffect(() => {
    if (cur.type === "textarea") autoSizeTextarea(textareaRef.current);
  }, [step, cur.type, displayValue]);

  function switchToTyping() {
    turn.abort();
    tts.stop();
    setInputMode("typing");
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      {inputMode === "voice" && (
        <button
          type="button"
          onClick={switchToTyping}
          className="btn"
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            background: "transparent",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-2)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "6px 12px",
            zIndex: 10,
          }}
        >
          keyboard ↩
        </button>
      )}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "stretch",
          maxWidth: 760,
          margin: "0 auto",
          width: "100%",
          padding: "0 40px",
        }}
      >
        <div key={step} style={{ animation: "fade-in 600ms var(--ease) both" }}>
          <Meta style={{ marginBottom: 24 }}>
            question {String(step + 1).padStart(2, "0")}
          </Meta>
          <label
            className="serif"
            style={{
              fontSize: 36,
              lineHeight: 1.25,
              color: "var(--ink-1)",
              display: "block",
              marginBottom: 36,
              letterSpacing: "0.005em",
              fontStyle: "italic",
            }}
          >
            {cur.label}
          </label>

          {isVoice && isSpeechField ? (
            <VoiceFieldDisplay state={turn.state} level={turn.level} transcript={turn.liveTranscript} />
          ) : cur.type === "textarea" ? (
            <textarea
              ref={textareaRef}
              className="field auto-grow"
              rows={1}
              autoFocus
              placeholder={cur.placeholder}
              value={displayValue}
              onChange={(e) => {
                autoSizeTextarea(e.currentTarget);
                applyValue(e.target.value, "type");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) next();
              }}
            />
          ) : cur.type === "mbti" ? (
            <MbtiPicker
              value={profile.mbti ?? null}
              onPick={(t) => setProfile({ ...profile, mbti: t })}
            />
          ) : cur.type === "dyads" ? (
            <DyadsPicker
              dyads={cur.dyads}
              value={profile.values ?? {}}
              onPick={(slug, side) =>
                setProfile({
                  ...profile,
                  values: { ...(profile.values ?? {}), [slug]: side },
                })
              }
            />
          ) : (
            <input
              className="field"
              autoFocus
              type={cur.type === "number" ? "text" : cur.type}
              inputMode={cur.type === "number" ? "numeric" : undefined}
              pattern={cur.type === "number" ? "[0-9]*" : undefined}
              placeholder={cur.placeholder}
              value={displayValue}
              onChange={(e) => applyValue(e.target.value, "type")}
              onKeyDown={(e) => {
                if (e.key === "Enter") next();
              }}
            />
          )}

          {!isVoice && cur.type !== "mbti" && cur.type !== "dyads" && (
            <MicButton
              showStatus
              onTranscript={(text) => applyValue(text, "voice")}
              onRecorded={(blob, durationMs) => {
                prime();
                if (!voiceMode) setVoiceMode(true);
                pushIntakeSample(blob);
                pushIntakeSeconds(durationMs / 1000);
                pushVoiceSample(blob);
              }}
            />
          )}

          {cur.suffix && (
            <div
              style={{
                marginTop: 18,
                color: "var(--ink-3)",
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 17,
              }}
            >
              {cur.suffix}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "32px 40px",
          maxWidth: 760,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <button
          className="under"
          onClick={() => setStep(Math.max(0, step - 1))}
          style={{ visibility: step === 0 ? "hidden" : "visible" }}
        >
          ← previous
        </button>

        <div style={{ display: "flex", gap: 4 }}>
          {INTAKE_FIELDS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 18,
                height: 1,
                background: i <= step ? "var(--ink-1)" : "var(--ink-4)",
                transition: "background 600ms var(--ease)",
              }}
            />
          ))}
        </div>

        <button className="under" onClick={next}>
          {step === INTAKE_FIELDS.length - 1 ? "begin →" : "continue →"}
        </button>
      </div>
    </div>
  );
}

function VoiceFieldDisplay({
  state,
  level,
  transcript,
}: {
  state: import("../voice/useVoiceTurn").TurnState;
  level: number;
  transcript: string;
}) {
  const ringScale = 1 + Math.min(level, 1) * 0.5;
  const statusText =
    state === "speaking"
      ? "asking…"
      : state === "listening"
        ? "listening…"
        : state === "transcribing"
          ? "transcribing…"
          : state === "reprompting"
            ? "one more time…"
            : state === "showing"
              ? "got it"
              : state === "fallback"
                ? "let's type this one"
                : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        padding: "24px 0",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background:
            state === "listening"
              ? "var(--accent)"
              : state === "speaking" || state === "reprompting"
                ? "var(--ink-1)"
                : "var(--bg-3)",
          transform: `scale(${ringScale.toFixed(3)})`,
          transition: "transform 80ms linear, background 200ms var(--ease)",
          opacity: state === "idle" ? 0.3 : 1,
        }}
      />
      <div
        className="meta"
        style={{
          color: "var(--ink-2)",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          minHeight: 14,
        }}
      >
        {statusText}
      </div>
      <div
        className="serif"
        style={{
          fontSize: 22,
          fontStyle: "italic",
          color: "var(--ink-1)",
          minHeight: 30,
          textAlign: "center",
        }}
      >
        {transcript}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(intake): add voice-mode branch to ScreenIntake"
```

---

## Task 8: TTS read-aloud on `ScreenHealth`

When the user reaches the health screen with voice mode active, read a single combined intro line aloud (the screen has 7 short button rows; reading each one would be tedious and would still require clicks). Inputs stay click-driven.

**Files:**
- Modify: `frontend/src/screens/screens-a.tsx` (`ScreenHealth` only)

- [ ] **Step 1: Read the intro on mount**

Inside `export function ScreenHealth(...)`, add at the top of the body (just after the `set` function declaration):

```typescript
  const { voiceMode } = useVoice();
  const voicePrimed = useVoicePrimed();
  const tts = useTTSPlayer();
  useEffect(() => {
    if (voiceMode && voicePrimed) {
      tts.play("A few quick health questions. Tap your answers.");
    }
    return () => tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

If `useVoice`, `useVoicePrimed`, and `useTTSPlayer` are not already imported in `ScreenHealth`'s scope (check the existing imports at the top of `screens-a.tsx`), they are — they're already imported for `ScreenIntake`. No new imports needed.

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/screens-a.tsx
git commit -m "feat(intake): TTS intro on ScreenHealth"
```

---

## Task 9: Manual smoke test

The frontend has no test runner; this task is a scripted end-to-end validation in the dev server. The spec's seven acceptance criteria map directly to the steps below.

**Files:** none — this task only verifies behavior.

- [ ] **Step 1: Start backend and frontend**

```bash
./scripts/dev.sh
```

In a second terminal:

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`.

- [ ] **Step 2: Walk the speak path**

1. Click "begin" on landing → take or skip selfie → confirm.
2. The new mode-select screen should appear with "Speak it" / "Type it" buttons.
3. Click **Speak it** → grant mic permission.
4. The first intake question should read aloud. After it finishes, the central ring turns to the accent color and "listening…" appears.
5. Speak an answer. After ~1.5s of silence, the transcript should appear briefly under the ring, then the next question loads.
6. Repeat for `name`, `age`, `occupation`, `workHours`, `topGoal`, `topFear` — all without touching the keyboard.
7. The MBTI screen should read its label aloud and require clicks. Same for dyads.
8. The `targetYear` question should accept "twenty" → 20.
9. Health screen plays the intro line and is button-driven.

Expected: screens 03→05 (mode → intake → health) complete with at most one click on each picker step.

- [ ] **Step 3: Test the failure path**

Restart, choose **Speak it**, and on the `name` question, stay silent for 30 seconds. Expected: hard ceiling fires, the reprompt plays, then on the second silence the field falls back to a focused text input. Type a name and press Enter.

- [ ] **Step 4: Test switch-to-typing**

Restart, choose **Speak it**, advance through `name`, then click `keyboard ↩` in the top right. Expected: TTS stops mid-sentence, the current question swaps to a focused text input, and all subsequent questions stay typed.

- [ ] **Step 5: Test the type path**

Restart, choose **Type it**. Expected: behavior matches main today (typed inputs, MicButton present, no auto-listen).

- [ ] **Step 6: Commit only if any tweaks were made**

If smoke testing surfaced bugs and you fixed them:

```bash
git add -p
git commit -m "fix(intake): <specific issue from smoke test>"
```

Otherwise no commit — proceed to /simplify.
