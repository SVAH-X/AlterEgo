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
