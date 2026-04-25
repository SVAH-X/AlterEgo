import { useCallback, useEffect, useRef, useState } from "react";
import { ttsBlobUrl } from "../lib/voice";

interface TTSPlayer {
  playing: boolean;
  loading: boolean;
  play: (text: string, voiceId?: string) => Promise<void>;
  stop: () => void;
}

export function useTTSPlayer(): TTSPlayer {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
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
  }, [cleanup]);

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
        // silently fall back; the screen still has visible text
        console.warn("tts failed:", e);
        return;
      }
      if (ac.signal.aborted) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;
      audio.onended = () => {
        setPlaying(false);
        cleanup();
      };
      audio.onerror = () => {
        setPlaying(false);
        cleanup();
      };
      try {
        await audio.play();
        setPlaying(true);
      } catch (e) {
        // autoplay-blocked etc. — bail quietly, screen text still works
        console.warn("audio.play() rejected:", e);
        cleanup();
      } finally {
        setLoading(false);
      }
    },
    [stop, cleanup],
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { playing, loading, play, stop };
}
