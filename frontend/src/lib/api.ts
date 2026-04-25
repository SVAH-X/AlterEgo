import type {
  Profile,
  SimulationData,
  StreamEvent,
} from "../types";

const BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://localhost:8000";

export interface ChatHistoryMessage {
  role: "user" | "future";
  text: string;
}

/**
 * Stream the simulation from /simulate. Yields {phase, ...} events as they arrive.
 * Phases: counting → plan → event (× N) → complete | error.
 */
export async function* simulateStream(
  profile: Profile,
  selfie: Blob,
): AsyncIterableIterator<StreamEvent> {
  const form = new FormData();
  form.append("profile", JSON.stringify(profile));
  form.append("selfie", selfie, "selfie.jpg");
  yield* readNDJSON(
    await fetch(`${BASE}/simulate`, {
      method: "POST",
      body: form,
    }),
  );
}

/**
 * Stream a counterfactual rerun. The user has stated they would have done
 * `interventionText` at `interventionYear`. The original simulation is sent
 * along so the backend can preserve pre-intervention checkpoints and only
 * re-plan from the intervention year onward.
 */
export async function* simulateBranchStream(
  profile: Profile,
  interventionYear: number,
  interventionText: string,
  originalSimulation: SimulationData,
  selfie: Blob,
): AsyncIterableIterator<StreamEvent> {
  const form = new FormData();
  form.append("profile", JSON.stringify(profile));
  form.append("intervention_year", String(interventionYear));
  form.append("intervention_text", interventionText);
  form.append("original_simulation", JSON.stringify(originalSimulation));
  form.append("selfie", selfie, "selfie.jpg");
  yield* readNDJSON(
    await fetch(`${BASE}/simulate/branch`, {
      method: "POST",
      body: form,
    }),
  );
}

async function* readNDJSON(r: Response): AsyncIterableIterator<StreamEvent> {
  if (!r.ok || !r.body) {
    const body = await r.text().catch(() => "");
    throw new Error(`${r.url} ${r.status}: ${body.slice(0, 200)}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line) as StreamEvent;
      } catch {
        // ignore malformed lines — backend wraps everything in NDJSON
      }
    }
  }
  // flush any trailing partial
  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail) as StreamEvent;
    } catch {
      /* ignore */
    }
  }
}

export async function chat(
  profile: Profile,
  simulation: SimulationData,
  history: ChatHistoryMessage[],
  user_text: string,
): Promise<string> {
  const r = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, simulation, history, user_text }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`/chat ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as { text: string };
  return data.text;
}
