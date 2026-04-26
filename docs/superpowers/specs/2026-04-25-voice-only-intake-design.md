# Voice-Only Intake — Design Spec

**Date:** 2026-04-25
**Branch:** feature/health-intake
**Status:** Approved (awaiting user review of this written spec)

## Goal

After the selfie, give the user a fork between **Speak it** and **Type it**. In the speak path, the entire intake runs hands-free: TTS reads each question, the mic auto-opens when the question ends, and a 1.5s silence window auto-submits the transcript and advances. The user never types and never presses record.

## Scope

**In scope:** the intake screen's free-text/number questions (`name`, `age`, `occupation`, `workHours`, `topGoal`, `topFear`, `targetYear`).

**Out of scope (still click-driven, with TTS read-aloud):** MBTI picker, values dyads, the entire health screen.

The selfie capture itself remains touch (camera/upload). Backend `/tts`, `/stt`, `/voice/clone` endpoints already exist and need no changes.

## User flow

```
Selfie  →  ModeSelect  →  Intake  →  Health  →  Processing → ...
              │
              ├─ "Speak it" → primes TTS+mic, intake runs hands-free
              └─ "Type it"  → existing keyboard intake
```

A new screen `ScreenModeSelect` is inserted at App index 2 (between Selfie and Intake). It contains the single user gesture that primes audio playback and requests mic permission. On success it sets `inputMode="voice"` and `primed=true` in `VoiceContext` and advances. On denial it shows a one-line error and routes to typed intake.

## Per-question state machine (voice mode)

```
SPEAKING       — TTS plays the question (mic closed)
   ↓ TTS ended
LISTENING      — mic open, RMS-driven ring
   ↓ 1.5s of sub-threshold silence after >=400ms of speech
TRANSCRIBING   — POST /stt
   ↓ non-empty transcript
SHOWING        — display transcript ~800ms
   ↓
ADVANCE        — applyValue + next() (or onContinue() on last field)
```

**Failure branches:**
- `/stt` returns empty or 5xx → enter **REPROMPTING**, TTS says "Sorry, I didn't catch that — could you say it again?", returns to LISTENING. Counter persists per question.
- Second consecutive failure on the same question → that field falls back to typed input (focused text field), the next question resumes voice automatically.
- Mic permission denied at the ModeSelect handshake → fall back to typed intake with a one-line error.

## Components

| File | Change |
|---|---|
| `frontend/src/screens/screen-mode-select.tsx` | **NEW.** The Speak/Type fork. Owns the mic-permission request and TTS prime. |
| `frontend/src/voice/useAutoListen.ts` | **NEW.** Hook wrapping `useMicRecorder` with a VAD loop. |
| `frontend/src/voice/useVoiceTurn.ts` | **NEW.** Composes TTS + auto-listen + STT into the per-question state machine. |
| `frontend/src/voice/VoiceContext.tsx` | Adds `inputMode: "voice" \| "typing" \| null` and `setInputMode`. (Distinct from `voiceMode`, which gates TTS playback.) |
| `frontend/src/screens/screens-a.tsx` (`ScreenIntake`) | Adds a voice-mode branch. When `inputMode==="voice"` and the field is text/number/textarea, the input area becomes a state ring + transcript display instead of a text field. MBTI/dyads keep existing UI; TTS still reads the label. |
| `frontend/src/screens/screens-a.tsx` (`ScreenHealth`) | TTS reads each row label on the screen entering, but inputs stay click-driven. |
| `frontend/src/App.tsx` | Inserts `ScreenModeSelect` into `SCREENS` at index 2; bumps subsequent indices. |

Backend: no changes.

## VAD details

`useAutoListen` polls the `level` from `useMicRecorder` (already RMS-normalized 0..1 via `tickLevel`, with `Math.min(1, rms * 2.5)` clamp). Per frame:

- If `level > 0.08` → mark `lastVoiceAt = now`, set `hasSpoken = true`.
- If `hasSpoken && now - lastVoiceAt > 1500ms` → fire `onSilence`.
- Hard ceiling: 30s per turn → fire `onSilence` regardless.
- Minimum: 400ms of speech-armed before silence-detection triggers (avoids cutting on the first inhale).

The "mic stays closed during TTS" rule is enforced by `useVoiceTurn`: it does not call `useAutoListen.start()` until `useTTSPlayer`'s playback ends.

## Persistent "switch to typing" affordance

Top-right button on `ScreenIntake` and `ScreenModeSelect` labeled `keyboard ↩`. Clicking it calls `setInputMode("typing")` and `tts.stop()` immediately, then re-renders the current field as the existing text input with autofocus. There is no path back to voice from here — once switched, the user finishes typing. (Avoids state ping-pong; restart for a fresh voice session.)

## Voice cloning

The current `MicButton` passively pushes every recorded clip into `intakeSamples` for `/voice/clone`. We preserve this in voice-only mode: every successful turn's audio Blob is also pushed via `pushVoiceSample` and `pushIntakeSample`, so the future-self chat replies can use the user's cloned voice.

## What we are explicitly NOT doing

- No TTS barge-in (mic stays closed until the question finishes playing).
- No "did I hear you right?" confirmation step.
- No spoken hotwords like "redo" — the typing fallback covers correction.
- No voice control over MBTI / dyads / health buttons.
- No backend changes.
- No new persistence beyond the existing `localStorage["alterego.voiceMode"]`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mic picks up TTS through speakers and self-triggers VAD | Mic stays closed during TTS playback (no barge-in). |
| `level > 0.08` threshold is wrong for some mics | Tune after one demo run; threshold is a single constant in `useAutoListen.ts`. |
| User sits in silence and the turn never fires | 30s hard ceiling triggers `onSilence` regardless. |
| First answer cut off too early | 400ms minimum-speech arming requirement before silence detection counts. |
| ElevenLabs `/stt` is slow → user feels stuck | TRANSCRIBING state shows "transcribing…" copy, REPROMPTING after timeout. |

## Acceptance criteria

1. Selfie → ModeSelect appears with "Speak it" / "Type it" buttons.
2. Tapping "Speak it" requests mic permission once. On grant, intake runs and the user can complete all 7 speech-able fields without a single click or keypress.
3. Each question is read aloud, mic opens after TTS ends, 1.5s of silence advances to the next question.
4. MBTI, dyads, and health screens read labels via TTS but require clicks.
5. A failed transcription reprompts once via TTS; a second failure swaps the current field to a focused text input.
6. The persistent `keyboard ↩` button switches the current and remaining questions back to typed input.
7. Voice samples collected during voice intake reach the existing `/voice/clone` pipeline unchanged.
