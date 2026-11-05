import { writeFile } from "node:fs/promises";
import { picksHistorySchema, picksSchema } from "@panky/shared";
import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import { realPicksSource } from "./picks-real-fixture.js";

for (const width of [1280, 390]) {
  test(`computed predictions expose their evidence and remain frozen at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?view=picks");
    await expect(
      page.getByRole("heading", { name: "Upcoming predictions", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Experimental predictions", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Preview · sample data|Illustrative probabilities/),
    ).toHaveCount(0);
    const before = picksSchema.parse(
      await (await page.request.get("/api/picks")).json(),
    );
    expect(before.availability.state).toBe("ready");
    expect(before.fixtures.length).toBeGreaterThan(0);
    const fixture = before.fixtures[width === 1280 ? 0 : 1];
    if (!fixture || fixture.sample)
      throw new Error("Expected computed fixture");
    const card = page.getByRole("button", {
      name: `View ${fixture.homeTeam} vs ${fixture.awayTeam}`,
      exact: true,
    });
    await page.screenshot({
      path: `test-results/picks-real-overview-${width}.png`,
      fullPage: true,
    });
    await card.click();
    await expect(page.getByText(/Kickoff time unavailable/)).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Prediction record" }),
    ).toBeVisible();
    await page.getByText("Model and source details", { exact: true }).click();
    await expect(
      page.getByText(fixture.prediction.modelVersion, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/picks-real-detail-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Explain this prediction", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Match analysis" })
        .getByText(/mock explanation/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .getByRole("region", { name: "Match analysis" })
        .getByText(/fictional teams/i),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "All fixtures", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Refresh predictions", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Refresh predictions", exact: true }),
    ).toBeEnabled();
    const after = picksSchema.parse(
      await (await page.request.get("/api/picks")).json(),
    );
    expect(after.fixtures).toEqual(before.fixtures);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("stale evidence holds new predictions and preserves the recorded forecasts", async ({
  page,
}) => {
  const sourcePath = process.env.PANKY_PICKS_TEST_SOURCE;
  if (!sourcePath) throw new Error("Missing isolated source path");
  const original = realPicksSource(new Date("2026-11-05T12:00:00Z"));
  const stale = structuredClone(original);
  for (const match of stale.matches) {
    if (match.season === "2026-27" && match.homeGoals !== null)
      match.matchDate = "2026-09-20";
  }
  const coverage = stale.coverage.find((item) => item.season === "2026-27");
  if (!coverage) throw new Error("Missing current coverage");
  coverage.latestCompletedDate = "2026-09-20";
  await page.goto("/?view=picks");
  const before = picksSchema.parse(
    await (await page.request.get("/api/picks")).json(),
  );
  try {
    await writeFile(sourcePath, JSON.stringify(stale));
    await page
      .getByRole("button", { name: "Refresh predictions", exact: true })
      .click();
    await expect(
      page.getByText("New predictions on hold", { exact: true }),
    ).toBeVisible();
    const held = picksSchema.parse(
      await (await page.request.get("/api/picks")).json(),
    );
    expect(held.availability.state).toBe("held");
    expect(held.fixtures).toEqual(before.fixtures);
    await expect(page.getByText(/Preview · sample data/)).toHaveCount(0);
    await page.screenshot({
      path: "test-results/picks-real-held.png",
      fullPage: true,
    });
  } finally {
    await writeFile(sourcePath, JSON.stringify(original));
    await page.request.post("/api/picks/refresh", {
      headers: { Origin: "http://localhost:5174" },
    });
  }
});

test("results retain every forecast and audit score corrections without rewriting predictions", async ({
  page,
}) => {
  const sourcePath = process.env.PANKY_PICKS_TEST_SOURCE;
  if (!sourcePath) throw new Error("Missing isolated source path");
  const original = picksSchema.parse(
    await (await page.request.get("/api/picks")).json(),
  ).fixtures;
  const snapshot = realPicksSource(new Date("2026-11-05T12:00:00Z"));
  snapshot.source = {
    ...snapshot.source,
    asOf: "2026-11-10",
    retrievedAt: "2026-11-10T12:00:00Z",
    revision: "b".repeat(40),
  };
  for (const [index, fixture] of original.entries()) {
    const match = snapshot.matches.find(
      (row) =>
        row.season === "2026-27" &&
        row.homeTeam === fixture.homeTeam &&
        row.awayTeam === fixture.awayTeam,
    );
    if (!match || fixture.sample)
      throw new Error("Missing original computed match");
    const mostLikely = Object.entries(fixture.probabilities).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const actual =
      index === 0 ? (mostLikely === "home" ? "away" : "home") : mostLikely;
    match.homeGoals = actual === "home" ? 1 : 0;
    match.awayGoals = actual === "away" ? 1 : 0;
  }
  const coverage = snapshot.coverage.find((row) => row.season === "2026-27");
  if (!coverage) throw new Error("Missing coverage");
  coverage.results += original.length;
  coverage.upcoming -= original.length;
  coverage.latestCompletedDate = "2026-11-08";
  await writeFile(sourcePath, JSON.stringify(snapshot));
  await writeFile(`${sourcePath}.clock`, "2026-11-10T12:00:00Z");
  await page.goto("/?view=picks");
  await page
    .getByRole("button", { name: "Refresh predictions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Results history", exact: true })
    .click();
  let history = picksHistorySchema.parse(
    await (await page.request.get("/api/picks/history")).json(),
  );
  expect(history.history).toHaveLength(original.length);
  expect(history.performance[0]).toMatchObject({
    scored: original.length,
    correct: original.length - 1,
    pending: 0,
  });
  for (const entry of history.history)
    expect(entry.fixture).toEqual(
      original.find((fixture) => fixture.id === entry.fixture.id),
    );
  const fixture = original[0];
  if (!fixture) throw new Error("Missing forecast");
  await page
    .getByRole("button", {
      name: `View result: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Recorded result" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recorded result" }),
  ).toContainText("Most likely outcome did not match");
  await page.screenshot({
    path: "test-results/picks-result-detail.png",
    fullPage: true,
  });
  const corrected = structuredClone(snapshot);
  corrected.source.revision = "c".repeat(40);
  corrected.source.retrievedAt = "2026-11-10T12:05:00Z";
  const match = corrected.matches.find(
    (row) =>
      row.season === "2026-27" &&
      row.homeTeam === fixture.homeTeam &&
      row.awayTeam === fixture.awayTeam,
  );
  if (!match) throw new Error("Missing corrected match");
  const mostLikely = Object.entries(fixture.probabilities).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  match.homeGoals = mostLikely === "home" ? 1 : 0;
  match.awayGoals = mostLikely === "away" ? 1 : 0;
  await writeFile(sourcePath, JSON.stringify(corrected));
  await writeFile(`${sourcePath}.clock`, "2026-11-10T12:05:00Z");
  await page
    .getByRole("button", { name: "Refresh predictions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh predictions", exact: true }),
  ).toBeEnabled();
  history = picksHistorySchema.parse(
    await (await page.request.get("/api/picks/history")).json(),
  );
  expect(history.performance[0]?.correct).toBe(original.length);
  expect(
    history.history.find((entry) => entry.fixture.id === fixture.id)?.revisions,
  ).toHaveLength(2);
  await expect(
    page.getByRole("region", { name: "Recorded result" }),
  ).toContainText("Most likely outcome matched");
  await page.getByText("Result revisions", { exact: true }).click();
  await page.screenshot({
    path: "test-results/picks-result-correction.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Results history", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Recorded predictions" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/picks-result-history-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
