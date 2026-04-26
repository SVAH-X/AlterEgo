import type { SimulationData } from "./types";

// Sample profile + simulation content. Sarah, 32, marketing director, 65h/wk, target 2046.
export const AE_DATA: SimulationData = {
  profile: {
    name: "Sarah",
    age: 32,
    occupation: "Marketing director",
    workHours: 65,
    topGoal: "Build something I'm actually proud of before forty",
    topFear: "Looking up at fifty and realizing I optimized for the wrong thing",
    targetYear: 2046,
    presentYear: 2026,
  },

  agents: [],

  agedPortraits: [
    { age: 32, year: 2026, trajectory: "high", imageUrl: null },
    { age: 37, year: 2031, trajectory: "high", imageUrl: null },
    { age: 42, year: 2036, trajectory: "high", imageUrl: null },
    { age: 47, year: 2041, trajectory: "high", imageUrl: null },
    { age: 52, year: 2046, trajectory: "high", imageUrl: null },
    { age: 32, year: 2026, trajectory: "low", imageUrl: null },
    { age: 37, year: 2031, trajectory: "low", imageUrl: null },
    { age: 42, year: 2036, trajectory: "low", imageUrl: null },
    { age: 47, year: 2041, trajectory: "low", imageUrl: null },
    { age: 52, year: 2046, trajectory: "low", imageUrl: null },
  ],

  checkpointsHigh: [
    {
      year: 2028,
      age: 34,
      title: "The promotion you took because you couldn't say no",
      event: "Senior VP role offered after a colleague's exit. Twelve more direct reports.",
      did: "Accepted on a Tuesday. Told yourself it was a two-year stretch.",
      consequence: "The two-year stretch becomes the shape of your thirties.",
      tone: "neutral",
    },
    {
      year: 2031,
      age: 37,
      title: "The first cardiologist appointment",
      event:
        "Resting heart rate up forty percent over five years. The doctor is calm, which scares you more.",
      did: "Cut caffeine. Did not cut hours.",
      consequence: "Sleep stays at five hours. The numbers come back the same in the spring.",
      tone: "warn",
    },
    {
      year: 2034,
      age: 40,
      title: "Your sister's wedding, on Zoom",
      event: "Q3 board prep lands the same week as the ceremony in Lisbon.",
      did: "Sent a video. They said they understood.",
      consequence: "You don't speak again for nine months. Neither of you names why.",
      tone: "neutral",
    },
    {
      year: 2038,
      age: 44,
      title: "The reorg that made the work unrecognizable",
      event: "Agency acquired. Your team's brand work folded into AI-led content ops.",
      did: "Stayed for the equity vest. Sixteen more months.",
      consequence: "By the time you leave, the thing you built is no longer in the building.",
      tone: "warn",
    },
    {
      year: 2042,
      age: 48,
      title: "A quiet Sunday in October",
      event:
        "No event. You sit at the kitchen counter for ninety minutes without picking up the phone.",
      did: "Started a list of what you would have done differently. Stopped at item three.",
      consequence: "The list stays in a drawer. You think about it more than you think about most things.",
      tone: "neutral",
    },
    {
      year: 2046,
      age: 52,
      title: "Where the simulation ends",
      event: "Comfortable. Respected in a field you stopped caring about around forty-three.",
      did: "Kept showing up. The thing you wanted to build never got built.",
      consequence: "The fear came true in slow motion. You did not see it happening.",
      tone: "warn",
    },
  ],

  futureSelfOpening:
    "The years aren't the unit. The unit is what you stopped noticing.",

  futureSelfReplies: {
    "What did I get wrong?":
      "You thought hours were the same as care. They aren't. By the time I noticed, the work had stopped loving me back.",
    "Am I happy?":
      "Some days. Not the way the magazines mean it. There's a Sunday kitchen table I wouldn't trade.",
    "What should I change?":
      "Call your sister this week, not next month. And start the side project badly, on a Saturday.",
  },
};
