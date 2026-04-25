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
