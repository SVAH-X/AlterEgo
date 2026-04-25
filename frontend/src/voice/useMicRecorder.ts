import { useCallback, useEffect, useRef, useState } from "react";

interface MicRecorder {
  recording: boolean;
  level: number; // 0..1 RMS-ish
  start: () => Promise<void>;
  stop: () => Promise<{ blob: Blob; durationMs: number } | null>;
  permissionDenied: boolean;
}

export function useMicRecorder(): MicRecorder {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const tickLevel = useCallback(() => {
    const an = analyserRef.current;
    if (!an) return;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    setLevel(Math.min(1, rms * 2.5));
    rafRef.current = requestAnimationFrame(tickLevel);
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current) return streamRef.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s;
      return s;
    } catch (e) {
      setPermissionDenied(true);
      throw e;
    }
  }, []);

  const start = useCallback(async () => {
    if (recording) return;
    const stream = await ensureStream();

    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      ctxRef.current = ctx;
      analyserRef.current = an;
    }

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start();
    recorderRef.current = rec;
    startedAtRef.current = performance.now();
    setRecording(true);
    rafRef.current = requestAnimationFrame(tickLevel);
  }, [recording, ensureStream, tickLevel]);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setRecording(false);
      return null;
    }
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.stop();
    await stopped;
    setRecording(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);
    const blob = new Blob(chunksRef.current, {
      type: rec.mimeType || "audio/webm",
    });
    const durationMs = performance.now() - startedAtRef.current;
    chunksRef.current = [];
    recorderRef.current = null;
    return { blob, durationMs };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { recording, level, start, stop, permissionDenied };
}
