import { type FootballMatch, matchDateSchema } from "./data.js";

export const MODEL_VERSION = "poisson-venue-shrink10-v1";
export type Probabilities = { home: number; draw: number; away: number };
export type FootballPrediction = {
  probabilities: Probabilities;
  expectedGoals: { home: number; away: number };
  trainingMatches: number;
  trainingThrough: string;
  homeMatches: number;
  awayMatches: number;
  baseline: Probabilities;
};
const priorMatches = 10;
const maximumGoals = 12;
const minimumHistory = 100;

function goalDistribution(mean: number) {
  const values = [Math.exp(-mean)];
  for (let goals = 1; goals <= maximumGoals; goals++)
    values.push(((values[goals - 1] ?? 0) * mean) / goals);
  return values;
}
function outcomeProbabilities(
  homeMean: number,
  awayMean: number,
): Probabilities {
  const home = goalDistribution(homeMean);
  const away = goalDistribution(awayMean);
  const result = { home: 0, draw: 0, away: 0 };
  for (const [homeGoals, homeProbability] of home.entries()) {
    for (const [awayGoals, awayProbability] of away.entries()) {
      const outcome =
        homeGoals > awayGoals
          ? "home"
          : homeGoals === awayGoals
            ? "draw"
            : "away";
      result[outcome] += homeProbability * awayProbability;
    }
  }
  const mass = result.home + result.draw + result.away;
  return {
    home: result.home / mass,
    draw: result.draw / mass,
    away: result.away / mass,
  };
}
const clampMean = (value: number) => Math.max(0.2, Math.min(4, value));

export function predictFootballMatch(
  matches: readonly FootballMatch[],
  fixture: FootballMatch,
  cutoffDate: string,
): FootballPrediction {
  matchDateSchema.parse(cutoffDate);
  matchDateSchema.parse(fixture.matchDate);
  const cutoff =
    cutoffDate < fixture.matchDate ? cutoffDate : fixture.matchDate;
  const year =
    Number(cutoff.slice(0, 4)) - (Number(cutoff.slice(5, 7)) < 7 ? 1 : 0);
  const windowStart = `${year - 1}-07-01`;
  const history = matches.filter(
    (match) =>
      match.competition === fixture.competition &&
      match.matchDate >= windowStart &&
      match.matchDate < cutoff &&
      match.homeGoals !== null &&
      match.awayGoals !== null,
  );
  if (history.length < minimumHistory)
    throw new Error(
      `At least ${minimumHistory} earlier completed matches are required.`,
    );
  let homeGoals = 0;
  let awayGoals = 0;
  const outcomes = { home: 1, draw: 1, away: 1 };
  const homeVenue = { played: 0, scored: 0, conceded: 0 };
  const awayVenue = { played: 0, scored: 0, conceded: 0 };
  let trainingThrough = "";
  for (const match of history) {
    const home = match.homeGoals;
    const away = match.awayGoals;
    if (home === null || away === null) continue;
    homeGoals += home;
    awayGoals += away;
    outcomes[home > away ? "home" : home === away ? "draw" : "away"]++;
    if (match.matchDate > trainingThrough) trainingThrough = match.matchDate;
    if (match.homeTeam === fixture.homeTeam) {
      homeVenue.played++;
      homeVenue.scored += home;
      homeVenue.conceded += away;
    }
    if (match.awayTeam === fixture.awayTeam) {
      awayVenue.played++;
      awayVenue.scored += away;
      awayVenue.conceded += home;
    }
  }
  const leagueHome = (homeGoals + 1) / (history.length + 1);
  const leagueAway = (awayGoals + 1) / (history.length + 1);
  const shrunk = (total: number, played: number, league: number) =>
    (total + priorMatches * league) / (played + priorMatches);
  const expectedGoals = {
    home: clampMean(
      (shrunk(homeVenue.scored, homeVenue.played, leagueHome) *
        shrunk(awayVenue.conceded, awayVenue.played, leagueHome)) /
        leagueHome,
    ),
    away: clampMean(
      (shrunk(awayVenue.scored, awayVenue.played, leagueAway) *
        shrunk(homeVenue.conceded, homeVenue.played, leagueAway)) /
        leagueAway,
    ),
  };
  return {
    probabilities: outcomeProbabilities(expectedGoals.home, expectedGoals.away),
    expectedGoals,
    trainingMatches: history.length,
    trainingThrough,
    homeMatches: homeVenue.played,
    awayMatches: awayVenue.played,
    baseline: {
      home: outcomes.home / (history.length + 3),
      draw: outcomes.draw / (history.length + 3),
      away: outcomes.away / (history.length + 3),
    },
  };
}
