/**
 * Microphone input — opt-in voice capture for intake fields.
 *
 * Uses two browser APIs in tandem:
 *   - Web Speech API (`SpeechRecognition`) → live transcription into the
 *     intake field. Free, no network call. Chrome/Edge full support; Safari
 *     partial; Firefox unsupported. The `MicButton` hides itself entirely
 *     when unsupported, so users get the typing experience as default.
 *   - MediaRecorder API → captures the raw audio Blob in parallel. Blobs
 *     are pushed up via `onAudioBlob`. The parent (App.tsx) accumulates them
 *     in a ref as the "port" for ElevenLabs voice cloning. ElevenLabs TTS
 *     is already wired (see backend/app/services/voice.py — it streams mp3
 *     for /chat/voice using `settings.elevenlabs_voice_id`). To turn the
 *     accumulated samples into the future-self's actual voice:
 *
 *         POST the concatenated Blobs to the ElevenLabs Instant Voice Clone
 *         endpoint, persist the returned voice_id on the profile, then pass
 *         it through to voice.py instead of the env-default.
 *
 * Cleanup is handled on unmount + on stop. Microphone tracks are released.
 */

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface MicInput {
  supported: boolean;
  recording: boolean;
  transcript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useMicInput(opts?: {
  onAudioBlob?: (blob: Blob) => void;
}): MicInput {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const finalTranscriptRef = useRef<string>("");

  const SR = getSpeechRecognition();
  const supported =
    SR !== null &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    !!window.MediaRecorder;

  const stop = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  };

  const start = async () => {
    if (!supported || recording) return;
    if (!SR) return;
    setError(null);
    finalTranscriptRef.current = "";
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // MediaRecorder for the raw audio (future ElevenLabs corpus)
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          opts?.onAudioBlob?.(blob);
          audioChunksRef.current = [];
        }
      };
      recorder.start();
      recorderRef.current = recorder;

      // SpeechRecognition for the live transcript
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) {
            finalTranscriptRef.current += r[0].transcript + " ";
          } else {
            interim += r[0].transcript;
          }
        }
        setTranscript((finalTranscriptRef.current + interim).replace(/\s+/g, " ").trim());
      };
      rec.onerror = (e) => {
        setError(e.error || "speech recognition error");
      };
      rec.onend = () => {
        // Browser auto-stops sometimes; restart if we still want to be recording.
        // We ignore that here — let the user click again to continue.
      };
      rec.start();
      recognitionRef.current = rec;

      setRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`microphone unavailable: ${msg}`);
      stop();
    }
  };

  const reset = () => {
    finalTranscriptRef.current = "";
    setTranscript("");
    setError(null);
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { supported, recording, transcript, error, start, stop, reset };
}

/**
 * MicButton — small circular icon next to a text input.
 *
 * Click to start recording: live transcript flows up via `onTranscript`
 * (the parent should treat each emission as a replacement of the field).
 * Click again to stop. Audio Blob is captured throughout and pushed via
 * `onAudioBlob` once recording stops (one Blob per recording session).
 *
 * Renders nothing if the browser doesn't support speech recognition —
 * keyboard input remains the only path.
 */
export function MicButton({
  onTranscript,
  onAudioBlob,
  disabled,
}: {
  onTranscript: (text: string) => void;
  onAudioBlob?: (blob: Blob) => void;
  disabled?: boolean;
}) {
  const mic = useMicInput({ onAudioBlob });
  const [hoverHint, setHoverHint] = useState(false);

  // Push every transcript update to the parent.
  useEffect(() => {
    if (mic.transcript) onTranscript(mic.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.transcript]);

  if (!mic.supported) return null;

  const handleClick = async () => {
    if (mic.recording) mic.stop();
    else await mic.start();
  };

  const isLive = mic.recording;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        marginTop: 18,
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        onMouseEnter={() => setHoverHint(true)}
        onMouseLeave={() => setHoverHint(false)}
        aria-label={isLive ? "Stop recording" : "Speak your answer"}
        style={{
          appearance: "none",
          background: isLive ? "rgba(212, 165, 116, 0.12)" : "transparent",
          border: `1px solid ${isLive ? "var(--accent)" : "var(--ink-4)"}`,
          color: isLive ? "var(--accent)" : "var(--ink-2)",
          width: 38,
          height: 38,
          borderRadius: "50%",
          cursor: disabled ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 350ms var(--ease)",
          padding: 0,
        }}
      >
        {isLive ? <PulsingDot /> : <MicIcon />}
      </button>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "lowercase",
          color: isLive
            ? "var(--accent)"
            : hoverHint
            ? "var(--ink-2)"
            : "var(--ink-3)",
          transition: "color 350ms var(--ease)",
        }}
      >
        {mic.error
          ? mic.error
          : isLive
          ? "listening — click to stop"
          : "speak instead"}
      </span>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function PulsingDot() {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        background: "currentColor",
        borderRadius: "50%",
        animation: "breathe 1.1s ease-in-out infinite",
      }}
    />
  );
}
