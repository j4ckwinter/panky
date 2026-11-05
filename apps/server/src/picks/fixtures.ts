import { picksSchema } from "@panky/shared";

export const sampleFixtures = picksSchema.parse({
  fixtures: [
    {
      id: "sample-premier-1",
      competition: "Premier League",
      homeTeam: "Northbridge",
      awayTeam: "Riverside",
      kickoff: "2026-11-07T15:00:00Z",
      probabilities: { home: 0.48, draw: 0.28, away: 0.24 },
      evidence: [
        "Illustrative home scoring average: 1.6 goals per match.",
        "Illustrative away scoring average: 1.1 goals per match.",
      ],
      caveats: [
        "Fictional teams and synthetic figures; no trained prediction model.",
        "No injuries or team news.",
      ],
      sample: true,
    },
    {
      id: "sample-championship-1",
      competition: "Championship",
      homeTeam: "Westfield",
      awayTeam: "Oakhampton",
      kickoff: "2026-11-07T15:00:00Z",
      probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
      evidence: [
        "Illustrative home scoring average: 1.3 goals per match.",
        "Illustrative away scoring average: 1.2 goals per match.",
      ],
      caveats: [
        "Fictional teams and synthetic figures; no trained prediction model.",
        "No injuries or team news.",
      ],
      sample: true,
    },
    {
      id: "sample-league-one-1",
      competition: "League One",
      homeTeam: "Kingswell",
      awayTeam: "Eastmoor",
      kickoff: "2026-11-07T15:00:00Z",
      probabilities: { home: 0.44, draw: 0.29, away: 0.27 },
      evidence: [
        "Illustrative home scoring average: 1.5 goals per match.",
        "Illustrative away scoring average: 1.2 goals per match.",
      ],
      caveats: [
        "Fictional teams and synthetic figures; no trained prediction model.",
        "No injuries or team news.",
      ],
      sample: true,
    },
    {
      id: "sample-league-two-1",
      competition: "League Two",
      homeTeam: "Ashford Vale",
      awayTeam: "Southport Heath",
      kickoff: "2026-11-08T14:00:00Z",
      probabilities: { home: 0.35, draw: 0.31, away: 0.34 },
      evidence: [
        "Illustrative home scoring average: 1.2 goals per match.",
        "Illustrative away scoring average: 1.2 goals per match.",
      ],
      caveats: [
        "Fictional teams and synthetic figures; no trained prediction model.",
        "No injuries or team news.",
      ],
      sample: true,
    },
  ],
}).fixtures;
