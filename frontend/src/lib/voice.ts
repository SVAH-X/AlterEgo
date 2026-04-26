const BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://localhost:8000";

export async function ttsBlobUrl(
  text: string,
  voiceId?: string,
  signal?: AbortSignal,
): Promise<string> {
  const r = await fetch(`${BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId ?? null }),
    signal,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`/tts ${r.status}: ${body.slice(0, 200)}`);
  }
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

export async function stt(blob: Blob, signal?: AbortSignal): Promise<string> {
  const fd = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  fd.append("audio", blob, `answer.${ext}`);
  const r = await fetch(`${BASE}/stt`, { method: "POST", body: fd, signal });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`/stt ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as { text: string };
  return data.text;
}

/** Trim-and-null wrapper around `stt`. Returns null on failure or empty result. */
export async function transcribe(blob: Blob): Promise<string | null> {
  try {
    const text = (await stt(blob)).trim();
    return text || null;
  } catch (e) {
    console.warn("stt failed:", e);
    return null;
  }
}

export async function cloneVoice(
  samples: Blob[],
  name: string,
  signal?: AbortSignal,
): Promise<string> {
  if (samples.length === 0) throw new Error("no samples to clone");
  const fd = new FormData();
  fd.append("name", name);
  samples.forEach((s, i) => {
    const ext = s.type.includes("mp4") ? "mp4" : "webm";
    fd.append("samples", s, `sample_${i}.${ext}`);
  });
  const r = await fetch(`${BASE}/voice/clone`, { method: "POST", body: fd, signal });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`/voice/clone ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as { voice_id: string };
  return data.voice_id;
}

export async function deleteVoice(voiceId: string): Promise<void> {
  // best-effort: swallow errors so a failed cleanup never breaks restart
  try {
    await fetch(`${BASE}/voice/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
    });
  } catch {
    /* ignore */
  }
}
