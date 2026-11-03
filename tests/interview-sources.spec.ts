import { expect, type Page } from "@playwright/test";
import { test, login } from "./auth-fixture.js";
import {
  endpoint,
  origin,
  mockNotion,
  openConnections,
  authorize,
} from "./connections-fixture.js";
import { audioFixture, expectReleased } from "./browser-audio-fixture.js";
import {
  openInterviewOptions,
  closeInterviewOptions,
} from "./interview-options.js";
import { personalPages } from "./notion-fixture.js";

async function typedOptions(page: Page) {
  await openInterviewOptions(page);
  if ((await page.locator(".interview-tools").getAttribute("open")) === null)
    await page.getByText("Ask a question", { exact: true }).click();
}
async function openTyped(page: Page) {
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await typedOptions(page);
}
async function pasteSample(page: Page, sample: string) {
  if (
    !(await page
      .getByLabel("Your experience sample", { exact: true })
      .isVisible())
  )
    await page
      .getByText("Experience sample (optional)", { exact: true })
      .click();
  await page.getByLabel("Your experience sample", { exact: true }).fill(sample);
}

test.beforeEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});
test.afterEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});

test("typed draft and source choice survive management navigation without a connection", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await openTyped(page);
  await expect(page.getByText("0 usable pages", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Legacy owner sources", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Describe my database migration.");
  await pasteSample(page, "I planned a rollback rehearsal.");
  await page
    .getByRole("checkbox", { name: "Use my sources", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Manage sources", exact: true })
    .focus();
  await page
    .getByRole("button", { name: "Manage sources", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to interview", exact: true })
    .click();
  await typedOptions(page);
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("Describe my database migration.");
  await expect(
    page.getByLabel("Your experience sample", { exact: true }),
  ).toHaveValue("I planned a rollback rehearsal.");
  await expect(
    page.getByRole("checkbox", { name: "Use my sources", exact: true }),
  ).not.toBeChecked();
  await page.screenshot({
    path: "test-results/interview-sources-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await typedOptions(page);
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("Describe my database migration.");
});

test("importing from management updates counts and source selection reaches saved interview evidence", async ({
  page,
}) => {
  await mockNotion(page);
  await openConnections(page);
  await authorize(page);
  await openTyped(page);
  await expect(page.getByText("0 usable pages", { exact: true })).toBeVisible();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Describe my migration and rollback.");
  await pasteSample(page, "I explained the rollback plan to colleagues.");
  await page
    .getByRole("button", { name: "Manage sources", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose pages", exact: true }).click();
  await page
    .getByLabel("Notion page ID or link", { exact: true })
    .fill(personalPages.migration);
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Owner migration", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to interview", exact: true })
    .click();
  await typedOptions(page);
  await expect(page.getByText("1 usable page", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("Describe my migration and rollback.");
  await page
    .getByRole("checkbox", { name: "Use my sources", exact: true })
    .uncheck();
  const off = page.waitForRequest(
    (request) =>
      request.url().endsWith("/messages") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Get response", exact: true }).click();
  const firstRequest = await off;
  expect(firstRequest.postDataJSON().interview).toMatchObject({
    useSources: false,
    experience: "I explained the rollback plan to colleagues.",
  });
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  const answer = page.getByRole("region", { name: "Interview answer" });
  await expect(answer.locator(".source-evidence")).toHaveCount(0);
  await typedOptions(page);
  await page
    .getByRole("checkbox", { name: "Use my sources", exact: true })
    .check();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("What was my migration contribution?");
  const on = page.waitForRequest(
    (request) =>
      request.url().endsWith("/messages") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Get response", exact: true }).click();
  const secondRequest = await on;
  expect(secondRequest.postDataJSON().interview.useSources).toBe(true);
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await answer.getByText("Retrieved evidence (1)", { exact: true }).click();
  await expect(answer).toContainText("Owner evidence: I planned the migration");
  const historyUrl = new URL(secondRequest.url()).pathname.replace(
    /\/messages$/,
    "",
  );
  const before = await (await page.request.get(historyUrl)).json();
  const saved = before.messages.at(-1).sources;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    title: "Owner migration",
    pageId: personalPages.migration,
  });
  await typedOptions(page);
  await page
    .getByRole("button", { name: "Manage sources", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Owner migration", exact: true })
    .getByRole("button", { name: "Remove page", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to interview", exact: true })
    .click();
  await typedOptions(page);
  await expect(page.getByText("0 usable pages", { exact: true })).toBeVisible();
  const after = await (await page.request.get(historyUrl)).json();
  expect(after.messages.at(-1).sources).toEqual(saved);
});

test("mobile management round trip retains typed context", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await openTyped(page);
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Explain a migration rollback.");
  await page.getByRole("button", { name: "Get response", exact: true }).click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await typedOptions(page);
  await page
    .getByLabel("What I actually said", { exact: true })
    .fill("I rehearsed the rollback.");
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Why that approach?");
  await page
    .getByRole("button", { name: "Manage sources", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to interview", exact: true })
    .click();
  await typedOptions(page);
  await expect(
    page.getByLabel("What I actually said", { exact: true }),
  ).toHaveValue("I rehearsed the rollback.");
  await expect(
    page.getByText("Recent questions (1)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("Why that approach?");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/interview-sources-mobile.png",
    fullPage: true,
  });
  const request = page.waitForRequest(
    (req) => req.url().endsWith("/messages") && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Get response", exact: true }).click();
  expect((await request).postDataJSON().interview.context).toEqual([
    {
      question: "Explain a migration rollback.",
      spokenAnswer: "I rehearsed the rollback.",
    },
  ]);
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
});

test("managing sources releases capture and returning does not restart listening", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await closeInterviewOptions(page);
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await typedOptions(page);
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Keep this typed question.");
  await page
    .getByRole("button", { name: "Manage sources", exact: true })
    .click();
  await expectReleased(page);
  await page
    .getByRole("button", { name: "Back to interview", exact: true })
    .click();
  await typedOptions(page);
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("Keep this typed question.");
  await expectReleased(page);
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    1,
  );
  await closeInterviewOptions(page);
  await expect(
    page.getByRole("button", { name: "Start listening", exact: true }),
  ).toBeVisible();
});

test("OAuth migration immediately removes the old legacy management entry", async ({
  page,
}) => {
  const imported = await page.request.post("/api/experience", {
    headers: { Origin: origin },
    data: { page: personalPages.migration },
  });
  expect(imported.status()).toBe(201);
  const legacy = await imported.json();
  try {
    await mockNotion(page);
    await openConnections(page);
    await authorize(page);
    await page.getByText("Legacy owner sources", { exact: true }).click();
    const legacyCard = page.getByRole("article", {
      name: "Legacy OAuth migration",
      exact: true,
    });
    await expect(legacyCard).toBeVisible();
    await page
      .getByRole("button", { name: "Choose pages", exact: true })
      .click();
    await page
      .getByLabel("Notion page ID or link", { exact: true })
      .fill(personalPages.migration);
    const pages = page.getByRole("region", {
      name: "Your Notion pages",
      exact: true,
    });
    await pages
      .getByRole("button", { name: "Import page", exact: true })
      .click();
    await expect(
      page.getByRole("article", { name: "Owner migration", exact: true }),
    ).toBeVisible();
    await expect(legacyCard).toHaveCount(0);
    const personal = await (
      await page.request.get(`${endpoint}/sources`)
    ).json();
    expect(personal.sources[0].id).toBe(legacy.id);
  } finally {
    await page.request.delete(`/api/experience/${legacy.id}`, {
      headers: { Origin: origin },
    });
  }
});
