// frontend/src/screens/processing-story.tsx
import type { AgentSpec, Checkpoint } from "../types";
import type { FilledOutline } from "../App";

// ----- timing -----
export const BUBBLE_STAGGER_MS = 700;
export const READY_HINT_DELAY_MS = 600;
export const INACTIVITY_TIMEOUT_MS = 30_000;
export const ENTRY_FADE_MS = 600;

// ----- types -----
export interface Bubble {
  who: string; // "narrator" | agent name
  line: string;
}

export interface ScrollEntry {
  outlineIdx: number;
  checkpoint: Checkpoint;
  primary_actors: string[];
  bubbles: Bubble[];
  revealStartedAt: number;
}

export type DockState =
  | "streaming"   // first event auto-revealing, or new event mid-reveal
  | "revealing"   // bubbles still appearing
  | "ready"       // last bubble in, awaiting user advance
  | "waiting"     // queue empty; backend hasn't produced next event yet
  | "final";      // last event done AND backend complete; advance leaves the screen

// Placeholder until later tasks add the real components.
// References to imported types here keep `noUnusedLocals` happy until Task 2.
export type _ModulePlaceholderTypes = {
  agent: AgentSpec;
  checkpoint: Checkpoint;
  outline: FilledOutline;
};
export const _moduleReady = true;
