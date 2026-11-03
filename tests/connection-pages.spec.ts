import { expect } from "@playwright/test";
import { test, mockGoogle } from "./auth-fixture.js";
import {
  origin,
  endpoint,
  mockNotion,
  openConnections,
  authorize,
} from "./connections-fixture.js";
import { personalPages } from "./notion-fixture.js";

test.beforeEach(async ({ page }) => {
  expect(
    (
      await page.request.delete(endpoint, { headers: { Origin: origin } })
    ).status(),
  ).toBe(204);
  await mockNotion(page);
  await openConnections(page);
  await authorize(page);
});
test.afterEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});

test("personal pages can be selected, inspected, refreshed with mixed results and removed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Choose pages", exact: true }).click();
  await page.getByRole("button", { name: "Search pages", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Owner migration", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Owner delivery", exact: true })
    .check();
  await page.getByRole("button", { name: /^Import selected/ }).click();
  const migration = page.getByRole("article", {
    name: "Owner migration",
    exact: true,
  });
  const delivery = page.getByRole("article", {
    name: "Owner delivery",
    exact: true,
  });
  await expect(migration).toBeVisible();
  await expect(delivery).toContainText("Unsupported image omitted");
  await migration.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toContainText("Owner evidence");
  await page.getByRole("button", { name: "Close passages" }).click();
  await page.getByRole("button", { name: "Refresh all", exact: true }).click();
  await expect(delivery).toContainText("Last refresh failed");
  await expect(delivery).toContainText("excluded from new answers");
  await migration.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toContainText("Revision 2");
  await page.getByRole("button", { name: "Close passages" }).click();
  await delivery.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toContainText("Revision 1");
  await page.screenshot({
    path: "test-results/connection-pages-desktop.png",
    fullPage: true,
  });
  await delivery.getByRole("button", { name: "Remove page" }).click();
  await expect(delivery).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toHaveCount(0);
  await migration.getByRole("button", { name: "Remove page" }).click();
  await expect(migration).toHaveCount(0);
  expect(await (await page.request.get(`${endpoint}/sources`)).json()).toEqual({
    sources: [],
  });
});

test("page discovery supports pagination, title search and manual links on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Choose pages", exact: true }).click();
  await page.getByRole("button", { name: "Search pages", exact: true }).click();
  await page.getByRole("button", { name: "Next results", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Owner slow page", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search page titles", { exact: true })
    .fill("migration");
  await page.getByRole("button", { name: "Search pages", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Owner migration", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Owner delivery", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Notion page ID or link", { exact: true })
    .fill(personalPages.unavailable);
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  await expect(page.getByText(/This page is unavailable/)).toBeVisible();
  await page
    .getByLabel("Notion page ID or link", { exact: true })
    .fill(
      `https://www.notion.so/${personalPages.migration.replaceAll("-", "")}`,
    );
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Owner migration", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/connection-pages-mobile.png",
    fullPage: true,
  });
});

test("two accounts keep separate copies and credentials for the same Notion page", async ({
  page,
  browser,
}) => {
  const ownerSourceResponse = await page.request.post(`${endpoint}/sources`, {
    headers: { Origin: origin },
    data: { page: personalPages.migration },
  });
  expect(ownerSourceResponse.status()).toBe(201);
  const ownerSource = await ownerSourceResponse.json();
  const email = "pages-friend@gmail.com";
  expect(
    (
      await page.request.post("/api/auth/access/invite", {
        headers: { Origin: origin },
        data: { email },
      })
    ).ok(),
  ).toBe(true);
  const context = await browser.newContext({ baseURL: origin });
  try {
    await mockGoogle(context, email);
    const friend = await context.newPage();
    await mockNotion(friend, "friend");
    await openConnections(friend);
    await authorize(friend);
    await friend
      .getByRole("button", { name: "Choose pages", exact: true })
      .click();
    await friend
      .getByRole("button", { name: "Search pages", exact: true })
      .click();
    await friend
      .getByRole("checkbox", { name: "Friend migration", exact: true })
      .check();
    await friend.getByRole("button", { name: /^Import selected/ }).click();
    const source = friend.getByRole("article", {
      name: "Friend migration",
      exact: true,
    });
    await expect(source).toBeVisible();
    await source.getByRole("button", { name: "Inspect passages" }).click();
    await expect(
      friend.getByRole("region", { name: "Imported passages" }),
    ).toContainText("Friend evidence");
    await expect(
      friend.getByRole("region", { name: "Imported passages" }),
    ).not.toContainText("Owner evidence");
    expect(
      (
        await friend.request.get(`${endpoint}/sources/${ownerSource.id}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await friend.request.post(
          `${endpoint}/sources/${ownerSource.id}/refresh`,
          { headers: { Origin: origin } },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await friend.request.delete(`${endpoint}/sources/${ownerSource.id}`, {
          headers: { Origin: origin },
        })
      ).status(),
    ).toBe(404);
    await friend.request.delete(endpoint, { headers: { Origin: origin } });
    const ownerList = await (
      await page.request.get(`${endpoint}/sources`)
    ).json();
    expect(ownerList.sources).toHaveLength(1);
    expect(ownerList.sources[0].id).toBe(ownerSource.id);
  } finally {
    await context.close();
    await page.request.post("/api/auth/access/revoke", {
      headers: { Origin: origin },
      data: { email },
    });
  }
});

test("disconnect during an import cancels the batch and keeps sources deleted", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Choose pages", exact: true }).click();
  await page.getByRole("button", { name: "Search pages", exact: true }).click();
  await page
    .getByLabel("Notion page ID or link", { exact: true })
    .fill(personalPages.slow);
  const started = page.waitForRequest(
    (request) =>
      request.url().endsWith(`${endpoint}/sources`) &&
      request.method() === "POST",
  );
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  await started;
  await page
    .getByRole("button", { name: "Disconnect Notion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm disconnect", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeVisible();
  expect(await (await page.request.get(`${endpoint}/sources`)).json()).toEqual({
    sources: [],
  });
});

test("a failed connection check updates source readiness while preserving inspectable copies", async ({
  page,
}) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
  await page.unroute("https://api.notion.com/v1/oauth/authorize?**");
  await mockNotion(page, "temporary");
  await page.reload();
  await authorize(page);
  expect(
    (
      await page.request.post(`${endpoint}/sources`, {
        headers: { Origin: origin },
        data: { page: personalPages.migration },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  const source = page.getByRole("article", {
    name: "Owner migration",
    exact: true,
  });
  await expect(source).toContainText("Ready");
  await source.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Notion could not be reached",
  );
  await expect(source).toContainText("excluded from new answers");
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("0 usable · 1 total", { exact: true }),
  ).toBeVisible();
  await source.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toContainText("Owner evidence");
});
