export type Tone = "neutral" | "warn" | "good";

export interface Profile {
  name: string;
  age: number;
  occupation: string;
  workHours: number;
  topGoal: string;
  topFear: string;
  targetYear: number;
  presentYear: number;
}

export interface Checkpoint {
  year: number;
  age: number;
  title: string;
  event: string;
  did: string;
  consequence: string;
  tone: Tone;
}

export interface SimulationData {
  profile: Profile;
  ages: number[];
  checkpointsHigh: Checkpoint[];
  checkpointsLow: Checkpoint[];
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
}

// --- Streaming orchestration shapes ---

export interface AgentSpec {
  agent_id: string;
  role: string;
  name: string;
  relationship: string;
  voice: string;
}

export interface OutlineEvent {
  year: number;
  severity: number;
  primary_actors: string[];
  visibility: string[];
  hint: string;
}

export type StreamEvent =
  | { phase: "counting"; agents: AgentSpec[] }
  | { phase: "plan"; outline: OutlineEvent[] }
  | { phase: "event"; index: number; checkpoint: Checkpoint }
  | { phase: "finalizing" }
  | { phase: "complete"; simulation: SimulationData }
  | { phase: "error"; message: string };
