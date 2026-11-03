import { expect, type Page } from "@playwright/test";
import { historySchema } from "@panky/shared";

import { test, login, token } from "./auth-fixture.js";
const apiBase = "http://localhost:5174/api";
async function connect(page: Page) {
  await page.goto("/");
  await login(page);
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
}

test("real clock tool result appears in the mock reply and survives refresh without replay", async ({
  page,
  request,
}) => {
  await connect(page);
  await page.getByLabel("New conversation", { exact: true }).click();
  const before = Date.now();
  const submitted = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/messages"),
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill("What is the current date and time?");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  const submission = await submitted;
  const historyUrl = submission.url().replace(/\/messages$/, "");
  const activity = page.getByRole("region", {
    name: "Task activity",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "Copy response", exact: true }),
  ).toBeVisible();
  await expect(activity).toHaveCount(0);
  const saved = historySchema.parse(
    await (
      await request.get(historyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  expect(saved.runs).toHaveLength(1);
  expect(saved.runs[0]?.status).toBe("completed");
  const result = saved.activities.find(
    (entry) => entry.kind === "tool_completed",
  );
  expect(result?.kind).toBe("tool_completed");
  if (result?.kind !== "tool_completed")
    throw new Error("Clock tool did not complete");
  const serialized = JSON.stringify(result.result);
  const iso = serialized.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
  )?.[0];
  expect(iso).toBeDefined();
  if (!iso) throw new Error("Clock tool did not record an ISO timestamp");
  expect(Date.parse(iso)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(iso)).toBeLessThanOrEqual(Date.now());
  await expect(
    page.getByRole("article", { name: "Panky response", exact: true }),
  ).toContainText(iso);
  await page.screenshot({
    path: "test-results/task-desktop.png",
    fullPage: true,
  });
  let posts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().startsWith(apiBase)) posts++;
  });
  await page.reload();
  await login(page);
  await page
    .getByRole("button", {
      name: "What is the current date and time?",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByRole("article", { name: "Panky response", exact: true }),
  ).toContainText(iso);
  const restored = historySchema.parse(
    await (
      await request.get(historyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  expect(restored.activities).toEqual(saved.activities);
  expect(restored.runs).toEqual(saved.runs);
  expect(posts).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/task-mobile.png",
    fullPage: true,
  });
});

test("Stop response stops a live reply and persists cancellation across refresh", async ({
  page,
  request,
}) => {
  await connect(page);
  await page.getByLabel("New conversation", { exact: true }).click();
  const submitted = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/messages"),
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill(`Cancellation check ${"words ".repeat(800)}`);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const historyUrl = (await submitted).url().replace(/\/messages$/, "");
  await expect(
    page.getByText(/This is a mock response from Panky/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stop response", exact: true })
    .click();
  const activity = page.getByRole("region", {
    name: "Task activity",
    exact: true,
  });
  await expect(
    page.getByText("Task cancelled. Any partial reply was saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(activity).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop response", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const saved = historySchema.parse(
    await (
      await request.get(historyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  expect(saved.runs[0]?.status).toBe("cancelled");
  expect(saved.messages).toHaveLength(2);
  expect(saved.messages[1]?.status).toBe("interrupted");
  expect(saved.messages[1]?.content.length).toBeLessThan(
    saved.messages[0]?.content.length ?? 0,
  );
  await page.reload();
  await login(page);
  await page.getByRole("button", { name: /^Cancellation check/ }).click();
  await expect(
    page.getByText("Task cancelled. Any partial reply was saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(activity).toHaveCount(0);
  const restored = historySchema.parse(
    await (
      await request.get(historyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  expect(restored.messages).toEqual(saved.messages);
  expect(restored.activities).toEqual(saved.activities);
});
