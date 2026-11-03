import { expect, type Request } from "@playwright/test";
import { mockGoogle, test } from "./auth-fixture.js";

import {
  origin,
  endpoint,
  mockNotion,
  openConnections,
  authorize,
} from "./connections-fixture.js";

test.beforeEach(async ({ page }) => {
  const result = await page.request.delete(endpoint, {
    headers: { Origin: origin },
  });
  expect(result.status()).toBe(204);
});

test.afterEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});

test("Notion connects across sites with strict cookies, persists and disconnects", async ({
  page,
}) => {
  await mockNotion(page);
  const callbacks: Request[] = [];
  const completions: Request[] = [];
  page.on("request", (request) => {
    if (request.url().includes(`${endpoint}/callback?`))
      callbacks.push(request);
    if (request.url().endsWith(`${endpoint}/complete`))
      completions.push(request);
  });
  await openConnections(page);
  await expect(page.getByText(/stored and processed/i)).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connections", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: "test-results/connections-disconnected.png",
    fullPage: true,
  });
  await authorize(page);
  expect(callbacks).toHaveLength(1);
  expect(completions).toHaveLength(1);
  expect((await callbacks[0]?.allHeaders())?.cookie ?? "").not.toContain(
    "panky-google-session",
  );
  expect((await completions[0]?.allHeaders())?.cookie).toContain(
    "panky-google-session",
  );
  await expect(
    page.getByText("Owner workspace", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose pages", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Owner workspace", { exact: true }),
  ).toBeVisible();
  const status = await page.request.get(endpoint);
  expect(await status.json()).toMatchObject({
    kind: "connected",
    workspace: { name: "Owner workspace" },
  });
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(storage).not.toMatch(/synthetic-notion|access_token|refresh_token/);
  await page.screenshot({
    path: "test-results/connections-connected.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Disconnect Notion", exact: true })
    .click();
  await expect(
    page.getByText("Disconnect Notion?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep connected", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Keep connected", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Disconnect Notion", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Disconnect Notion", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Confirm disconnect", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeVisible();
  expect(await (await page.request.get(endpoint)).json()).toEqual({
    kind: "disconnected",
  });
});

test("Notion denial and exchange failure return to usable Connections on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNotion(page, "owner", true);
  await openConnections(page);
  await authorize(page, true);
  await expect(page.getByText(/Notion access was not granted/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeEnabled();
  await page.unroute("https://api.notion.com/v1/oauth/authorize?**");
  await mockNotion(page, "failure");
  await authorize(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/connections-mobile.png",
    fullPage: true,
  });
});

test("expired Notion access requests reconnection and can be restored", async ({
  page,
}) => {
  await mockNotion(page, "revoked");
  await openConnections(page);
  await authorize(page);
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reconnect Notion", exact: true }),
  ).toBeVisible();
  await page.unroute("https://api.notion.com/v1/oauth/authorize?**");
  await mockNotion(page);
  await authorize(page);
  await expect(
    page.getByRole("button", { name: "Check connection", exact: true }),
  ).toBeVisible();
});

test("an invited user connects a separate Notion workspace", async ({
  page,
  browser,
}) => {
  await mockNotion(page);
  await openConnections(page);
  await authorize(page);
  const email = "notion-friend@gmail.com";
  const invite = await page.request.post("/api/auth/access/invite", {
    headers: { Origin: origin },
    data: { email },
  });
  expect(invite.ok()).toBe(true);
  const friendContext = await browser.newContext({ baseURL: origin });
  try {
    await mockGoogle(friendContext, email);
    const friend = await friendContext.newPage();
    await mockNotion(friend, "friend");
    await openConnections(friend);
    await expect(
      friend.getByRole("button", { name: "Connect Notion", exact: true }),
    ).toBeVisible();
    await authorize(friend);
    await expect(
      friend.getByText("Friend workspace", { exact: true }),
    ).toBeVisible();
    await expect(
      friend.getByText("Owner workspace", { exact: true }),
    ).toHaveCount(0);
    await friend.request.delete(endpoint, { headers: { Origin: origin } });
    await page.reload();
    await expect(
      page.getByText("Owner workspace", { exact: true }),
    ).toBeVisible();
  } finally {
    await friendContext.close();
    await page.request.post("/api/auth/access/revoke", {
      headers: { Origin: origin },
      data: { email },
    });
  }
});

test("Connections recovers from a failed status request without submitting authorization", async ({
  page,
}) => {
  let authorizations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(`${endpoint}/authorize`)) authorizations++;
  });
  await page.route(`**${endpoint}`, (route) =>
    route.abort("connectionrefused"),
  );
  await openConnections(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute(`**${endpoint}`);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeEnabled();
  expect(authorizations).toBe(0);
});
