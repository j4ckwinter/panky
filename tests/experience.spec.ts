import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

test("selected Notion imports supply inspectable evidence, refresh safely and can be removed", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  await page.getByText("Notion experience", { exact: true }).click();
  const field = page.getByLabel("Notion page ID or link", { exact: true });
  await expect(field).toBeEnabled();
  await field.fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  const source = page.getByRole("article", {
    name: "Synthetic migration project",
    exact: true,
  });
  await expect(source).toContainText("1 passage");
  await expect(source).toContainText("Skipped unsupported block: image.");
  await source.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toContainText("I proposed a staged database migration");
  await page.getByRole("button", { name: "Close passages" }).click();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Describe a database migration rollout and rollback rehearsal.");
  await page.getByRole("button", { name: "Get talking points" }).click();
  await expect(
    page.getByText("Talking points ready.", { exact: true }),
  ).toBeVisible();
  const answer = page.getByRole("region", { name: "Interview answer" });
  await answer.getByText("Retrieved evidence (1)", { exact: true }).click();
  await expect(answer).toContainText("I proposed a staged database migration");
  await expect(
    answer.getByRole("link", {
      name: "[S1] Synthetic migration project",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    "https://www.notion.so/11111111111141118111111111111111#22222222222242228222222222222222",
  );
  await expect(answer).toContainText("synthetic demo");
  await page.screenshot({
    path: "test-results/experience-desktop.png",
    fullPage: true,
  });
  await source
    .getByRole("button", { name: "Refresh page", exact: true })
    .click();
  const updated = page.getByRole("article", {
    name: "Synthetic migration project updated",
    exact: true,
  });
  await expect(updated).toBeVisible();
  await expect(source).toHaveCount(0);
  await updated.getByRole("button", { name: "Inspect passages" }).click();
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toContainText("idempotency keys");
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).not.toContainText("staged database migration");
  await field.fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  await expect(updated).toContainText("Last refresh failed:");
  await expect(
    page.getByRole("region", { name: "Imported passages" }),
  ).toHaveCount(0);
  await updated
    .getByRole("button", { name: "Refresh page", exact: true })
    .click();
  await expect(updated).toContainText("Last refresh failed:");
  await expect(updated).toContainText("excluded from new answers");
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("How did I use idempotency keys and durable delivery?");
  await page.getByRole("button", { name: "Get talking points" }).click();
  await expect(
    page.getByText("Talking points ready.", { exact: true }),
  ).toBeVisible();
  await expect(answer.locator(".source-evidence")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await updated.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/experience-mobile.png",
    fullPage: true,
  });
  await updated
    .getByRole("button", { name: "Remove page", exact: true })
    .click();
  await expect(updated).toHaveCount(0);
  await expect(
    page.getByText("No imported pages yet.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Saved answers and their evidence snapshots may still contain excerpts/,
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await login(page);
  await page
    .getByRole("button", {
      name: "Describe a database migration rollout and rollback rehearsal.".slice(
        0,
        60,
      ),
      exact: true,
    })
    .click();
  const saved = page
    .getByRole("article", { name: "Panky response", exact: true })
    .first();
  await saved.getByText("Retrieved evidence (1)", { exact: true }).click();
  await expect(saved).toContainText("I proposed a staged database migration");
});

test("an inaccessible selected Notion page reports a failure without adding a source", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  await page.getByText("Notion experience", { exact: true }).click();
  await page
    .getByLabel("Notion page ID or link", { exact: true })
    .fill("33333333-3333-4333-8333-333333333333");
  await page.getByRole("button", { name: "Import page", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not update experience",
  );
  await expect(
    page.getByText("No imported pages yet.", { exact: true }),
  ).toBeVisible();
});
