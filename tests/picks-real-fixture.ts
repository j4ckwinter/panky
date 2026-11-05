import {
  footballSnapshotSchema,
  normalizeFootballFile,
} from "../apps/server/src/picks/data.js";

export function realPicksSource(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  const dateAfter = (days: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000)
      .toISOString()
      .slice(0, 10);
  const files = [year - 1, year].map((startYear) => {
    const season = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
    const matches: Array<{
      date: string;
      team1: string;
      team2: string;
      score?: number[];
    }> = [];
    for (let home = 0; home < 20; home++) {
      for (let away = 0; away < 20; away++) {
        if (home === away) continue;
        const completed = startYear < year || matches.length < 20;
        matches.push({
          date:
            startYear < year
              ? `${startYear + 1}-05-01`
              : dateAfter(completed ? -1 : matches.length < 40 ? 3 : 20),
          team1: `Club ${home + 1}`,
          team2: `Club ${away + 1}`,
          ...(completed ? { score: [home % 4, away % 3] } : {}),
        });
      }
    }
    return normalizeFootballFile(
      {
        name: `English Premier League ${startYear}/${season.slice(-2)}`,
        matches,
      },
      { competition: "en.1", season, asOf: today },
    );
  });
  return footballSnapshotSchema.parse({
    source: {
      name: "OpenFootball",
      revision: "a".repeat(40),
      retrievedAt: now.toISOString(),
      license: "CC0-1.0",
      asOf: today,
    },
    matches: files.flatMap((file) => file.matches),
    coverage: files.map((file) => file.coverage),
  });
}
