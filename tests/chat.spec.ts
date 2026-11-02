import { expect } from "@playwright/test";

import { test, login, token } from "./auth-fixture.js";

test("authenticates, streams from the server and restores conversations after reload", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Remember my pancakes.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Remember my pancakes.", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText(/This is a mock response from Panky/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await expect(page.locator(".composer-note")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/chat-desktop.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(token);
  await page.reload();
  await login(page);
  await page.getByRole("button", { name: /^Remember my pancakes/ }).click();
  await expect(
    page.getByText(/This is a mock response from Panky/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/chat-mobile.png",
    fullPage: true,
  });
});

test("reports an unreachable backend and lets the user retry", async ({
  page,
}) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute(/^https?:\/\/[^/]+\/api\//);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await login(page);
});

test("reload interrupts a reply and does not submit it again", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page
    .getByLabel("Message", { exact: true })
    .fill(`Interrupt this reply. ${"a ".repeat(1000)}`);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(/This is a mock response from Panky/),
  ).toBeVisible();
  await expect(page.getByText("Replying…", { exact: true })).toBeVisible();
  await page.reload();
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      submissions++;
  });
  await login(page);
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: /^Interrupt this reply/ }).click();
  await expect(
    page.getByText(/Reply interrupted\. This partial reply was saved/),
  ).toBeVisible();
  await expect(page.locator(".composer-note")).toContainText(
    "Refresh history before sending again",
  );
  await page
    .getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    })
    .click();
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("article", { name: "Panky response", exact: true }),
  ).toHaveCount(1);
  expect(submissions).toBe(0);
});

test("maximum valid message streams progressively and completes", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  const content = "a ".repeat(4000).trim();
  await page.getByLabel("Message", { exact: true }).fill(content);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const reply = page.getByRole("article", {
    name: "Panky response",
    exact: true,
  });
  await expect(reply).toContainText("This is a mock response from Panky");
  await expect(page.getByText("Replying…", { exact: true })).toBeVisible();
  const partial = await reply.textContent();
  expect(partial?.length).toBeLessThan(content.length);
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled({ timeout: 20_000 });
  await expect(reply).toContainText(content);
  await expect(page.getByText(/Reply interrupted/)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Enter sends, Shift+Enter inserts a line, and composing Enter does not send", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  const input = page.getByLabel("Message", { exact: true });
  const messages = page.getByRole("article", {
    name: "Your message",
    exact: true,
  });
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(messages).toHaveCount(0);
  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.pressSequentially("Second line");
  await expect(input).toHaveValue("First line\nSecond line");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(input).toHaveValue("First line\nSecond line");
  await expect(messages).toHaveCount(0);
  await input.press("Enter");
  await expect(messages).toHaveCount(1);
  await expect(messages).toContainText("First line\nSecond line");
  await expect(input).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
});

test("mobile conversations close with Escape, backdrop and selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await login(page);
  const menu = page.getByRole("button", { name: "Conversations", exact: true });
  await menu.click();
  const drawer = page.getByRole("dialog", {
    name: "Conversations",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Close conversations" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    drawer
      .locator("button:visible:not(:disabled), input:visible:not(:disabled)")
      .last(),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    drawer.getByRole("button", { name: "Close conversations" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .locator(".sidebar-backdrop")
    .click({ position: { x: 380, y: 300 } });
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await expect(page.locator("#composer-help")).toHaveCount(0);
  await menu.click();
  await page.screenshot({
    path: "test-results/drawer-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer).toHaveCount(0);
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
});

test("disconnected composer explains why sending is unavailable and preserves draft", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByLabel("Message", { exact: true }).fill("Keep this draft");
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) =>
    route.abort("connectionrefused"),
  );
  await expect(page.locator("#composer-help")).toContainText(
    "Connection lost",
    { timeout: 10000 },
  );
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this draft",
  );
});
