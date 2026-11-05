import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { picksSchema } from "@panky/shared";
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
