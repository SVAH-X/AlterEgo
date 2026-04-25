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

  ages: [32, 38, 45, 52, 56],

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
      did: "Sent a video. She said she understood.",
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

  checkpointsLow: [
    {
      year: 2028,
      age: 34,
      title: "The promotion you turned down",
      event: "Senior VP role offered. You ask for a week. Then say no.",
      did: "Took the principal individual contributor track instead. Half the politics.",
      consequence: "Your manager is annoyed for a quarter, then forgets.",
      tone: "neutral",
    },
    {
      year: 2030,
      age: 36,
      title: "The side project you finally finished",
      event: "Two years of Saturday mornings on a small brand studio with a friend from school.",
      did: "Launched it without quitting. Three clients in the first month.",
      consequence: "It pays for itself by year-end. You start dreaming about it on weekdays.",
      tone: "good",
    },
    {
      year: 2033,
      age: 39,
      title: "The leap, taken on purpose",
      event: "Studio revenue crosses your salary. Six months of runway saved.",
      did: "Resigned in person. Cried in the car. Drove to the studio.",
      consequence: "First year is hard. Second year is yours.",
      tone: "good",
    },
    {
      year: 2037,
      age: 43,
      title: "Your father's last summer",
      event: "Diagnosis in May. Eight weeks at the lake house through August.",
      did: "Closed the studio for the season. Took your laptop and didn't open it.",
      consequence:
        "You will remember the boat, the smell of the porch, the way he laughed at your impressions. You will not remember what you missed at work.",
      tone: "good",
    },
    {
      year: 2041,
      age: 47,
      title: "The work that became known for being yours",
      event: "A campaign for a museum gets written about in a way that names you.",
      did: "Hired a third designer. Kept the studio at six people on purpose.",
      consequence: "You stop apologizing for the size of what you built.",
      tone: "good",
    },
    {
      year: 2046,
      age: 52,
      title: "Where the simulation ends",
      event: "A studio with your name on the door. Tired in a way that feels earned.",
      did: "Built the thing. Lost some years. Kept the ones that mattered.",
      consequence: "The fear did not come true. Something else did.",
      tone: "good",
    },
  ],

  futureSelfOpening:
    "It's me. I know that's strange. I'm older than you remember being. I want to tell you that you're going to be fine — that's the thing people say — but I think you'd rather I told you what's actually here.",

  futureSelfReplies: {
    "What did I get wrong?":
      "You thought hours were the same as care. They aren't. The work loved you back for a while, and then it stopped, and you didn't notice for a long time. That's the part I'd take back if I could.",
    "Am I happy?":
      "Some days. Not the way the magazines mean it. I'm not hollow. I'm not full either. There's a kitchen table I sit at on Sunday mornings that I would not trade. There's a list in a drawer that I would.",
    "What should I change?":
      "Sleep. I know. Everyone says sleep. But also — call your sister this week, not next month. And the side project you keep almost-starting. Start it badly. Start it on a Saturday. Don't wait for the version of yourself who has time.",
  },
};
