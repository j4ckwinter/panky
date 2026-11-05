import { picksSchema } from "@panky/shared";
import { expect, type Page } from "@playwright/test";
import { test } from "./auth-fixture.js";

async function navigate(
  page: Page,
  feature: "Picks" | "Chats",
  mobile: boolean,
) {
  if (mobile) {
    await page
      .getByRole("button", {
        name: feature === "Picks" ? "Conversations" : "Picks navigation",
        exact: true,
      })
      .click();
  }
  await page.getByRole("button", { name: feature, exact: true }).click();
}

for (const width of [1280, 390]) {
  test(`Picks keeps predictions separate from chat at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const composer = page.getByLabel("Message", { exact: true });
    await composer.fill("Keep my ordinary chat draft");
    const before = await (await page.request.get("/api/conversations")).json();
    const { fixtures } = picksSchema.parse(
      await (await page.request.get("/api/picks")).json(),
    );
    const fixture = fixtures[width === 1280 ? 0 : 1];
    if (!fixture) throw new Error("Expected a sample fixture");
    await navigate(page, "Picks", width <= 640);
    await expect(
      page.getByRole("heading", { name: "Pancake Picks", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/view=picks/);
    await expect(page.getByLabel("Search chats", { exact: true })).toHaveCount(
      0,
    );
    await expect(composer).toHaveCount(0);
    await expect(
      page
        .locator("main")
        .getByText(/sample/i)
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/odds|bookmaker/i)).toHaveCount(0);
    const card = page.getByRole("button", {
      name: `View ${fixture.homeTeam} vs ${fixture.awayTeam}`,
      exact: true,
    });
    await page
      .getByRole("button", { name: fixture.competition, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /^View .+ vs / }),
    ).toHaveCount(1);
    await expect(card).toBeVisible();
    await page
      .getByRole("button", { name: "All competitions", exact: true })
      .click();
    await page.screenshot({
      path: `test-results/picks-overview-${width}.png`,
      fullPage: true,
    });
    await card.focus();
    await page.keyboard.press("Enter");
    const back = page.getByRole("button", {
      name: "All fixtures",
      exact: true,
    });
    await expect(back).toBeFocused();
    await page.screenshot({
      path: `test-results/picks-prediction-${width}.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole("button", {
        name: "Explain this prediction",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Explain this prediction", exact: true })
      .click();
    const analysis = page.getByRole("region", {
      name: "Match analysis",
      exact: true,
    });
    await expect(analysis.getByText(/mock explanation/i).last()).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByRole("textbox", { name: "Ask about this match", exact: true })
      .fill("What makes this prediction uncertain?");
    await page.getByRole("button", { name: "Ask Panky", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Ask about this match", exact: true }),
    ).toBeEnabled({ timeout: 20_000 });
    await expect(
      analysis.getByText("What makes this prediction uncertain?", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/picks-detail-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await back.click();
    await expect(card).toBeFocused();
    await navigate(page, "Chats", width <= 640);
    await expect(composer).toHaveValue("Keep my ordinary chat draft");
    expect(await (await page.request.get("/api/conversations")).json()).toEqual(
      before,
    );
    await navigate(page, "Picks", width <= 640);
    await page.reload();
    await expect(card).toBeVisible();
    await card.click();
    await expect(
      analysis
        .getByText("What makes this prediction uncertain?", { exact: true })
        .last(),
    ).toBeVisible();
  });
}

test("Picks reports a failed submission without automatically retrying", async ({
  page,
}) => {
  await page.goto("/?view=picks");
  await page
    .getByRole("button", { name: /^View .+ vs / })
    .last()
    .click();
  let submissions = 0;
  await page.route("**/api/picks/*/analysis", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submissions++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Local model temporarily unavailable." }),
    });
  });
  await page
    .getByRole("button", { name: "Explain this prediction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Local model temporarily unavailable.",
  );
  await expect(
    page.getByRole("textbox", { name: "Ask about this match", exact: true }),
  ).toBeEnabled();
  expect(submissions).toBe(1);
});

test("Picks distinguishes an active response from an interrupted response", async ({
  page,
}) => {
  let running = true;
  await page.route("**/api/picks/*/analysis", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            role: "assistant",
            content: "The match remains uncertain.",
            status: running ? "running" : "completed",
            createdAt: "2026-11-05T12:00:00Z",
          },
        ],
      }),
    }),
  );
  await page.goto("/?view=picks");
  await page
    .getByRole("button", { name: /^View .+ vs / })
    .first()
    .click();
  await expect(page.getByText(/Response in progress/)).toBeVisible();
  await expect(
    page.getByText(/Response interrupted|Response failed/),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Ask about this match", exact: true })
    .fill("What is missing?");
  await expect(
    page.getByRole("button", { name: "Ask Panky", exact: true }),
  ).toBeDisabled();
  running = false;
  await page
    .getByRole("button", { name: "Refresh analysis", exact: true })
    .click();
  await expect(page.getByText(/Response in progress/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ask Panky", exact: true }),
  ).toBeEnabled();
});

test("Picks cancellation preserves an interrupted answer and releases the model", async ({
  page,
}) => {
  await page.goto("/?view=picks");
  await page
    .getByRole("button", { name: "View Kingswell vs Eastmoor", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explain this prediction", exact: true })
    .click();
  await expect
    .poll(
      async () => (await (await page.request.get("/api/health")).json()).busy,
      { intervals: [25] },
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Cancel analysis", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Explanation stopped");
  await expect
    .poll(
      async () => (await (await page.request.get("/api/health")).json()).busy,
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Refresh analysis", exact: true })
    .click();
  await expect(page.getByText(/Response interrupted/)).toBeVisible();
  const result = await page.request.get(
    "/api/picks/sample-league-one-1/analysis",
  );
  expect((await result.json()).messages).toHaveLength(2);
});
