export type Tone = "neutral" | "warn" | "good";
export type Trajectory = "high" | "low";

export type SleepHours = "<5" | "5-6" | "6-7" | "7-8" | "8+";
export type ExerciseDays = "0" | "1-2" | "3-4" | "5+";
export type CaffeineCups = "0" | "1" | "2" | "3" | "4+";
export type AlcoholDrinks = "0" | "1-3" | "4-7" | "8-14" | "15+";
export type StressLevel = "low" | "moderate" | "high" | "severe";
export type MoodBaseline = "mostly low" | "mixed" | "mostly steady" | "mostly positive";
export type LonelinessFrequency = "rarely" | "sometimes" | "often";

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
  // Body
  sleepHours?: SleepHours | null;
  exerciseDays?: ExerciseDays | null;
  caffeineCups?: CaffeineCups | null;
  alcoholDrinks?: AlcoholDrinks | null;
  // Mind
  stressLevel?: StressLevel | null;
  moodBaseline?: MoodBaseline | null;
  lonelinessFrequency?: LonelinessFrequency | null;
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

export type HealthState = "stable" | "strained" | "critical";

export interface ClinicalRiskFactor {
  label: string;
  consequence: string;
}

export interface ClinicalSummary {
  riskFactors: ClinicalRiskFactor[];
  finalHealthState: HealthState;
}

export interface SimulationData {
  profile: Profile;
  agents: AgentSpec[];
  agedPortraits: AgedPortrait[];
  checkpointsHigh: Checkpoint[];
  futureSelfOpening: string;
  futureSelfReplies: Record<string, string>;
  clinicalSummary?: ClinicalSummary | null;
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
