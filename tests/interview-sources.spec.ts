import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import {
  endpoint,
  origin,
  mockNotion,
  openConnections,
  authorize,
} from "./connections-fixture.js";
import { personalPages } from "./notion-fixture.js";
test.beforeEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});
test.afterEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
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
