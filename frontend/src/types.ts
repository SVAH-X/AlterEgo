export type Tone = "neutral" | "warn" | "good";
export type Trajectory = "high" | "low";

export interface Profile {
  name: string;
  age: number;
  occupation: string;
  workHours: number;
  topGoal: string;
  topFear: string;
  targetYear: number;
  presentYear: number;
  mbti?: string | null;
  values?: Record<string, string> | null;
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

export interface AgedPortrait {
  age: number;
  year: number;
  trajectory: Trajectory;
  imageUrl: string | null;
}

export interface SimulationData {
  profile: Profile;
  agents: AgentSpec[];
  agedPortraits: AgedPortrait[];
  checkpointsHigh: Checkpoint[];
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
  | { phase: "portrait"; trajectory: Trajectory; index: number; portrait: AgedPortrait }
  | { phase: "portrait_error"; trajectory: Trajectory; index: number; message: string }
  | { phase: "complete"; simulation: SimulationData }
  | { phase: "error"; message: string };
