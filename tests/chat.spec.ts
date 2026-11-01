import { expect, test } from "@playwright/test";

const token = "panky-browser-test-token-never-use-in-production";

test("authenticates, streams from the server and restores conversations after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill("wrong-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
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
    page.getByRole("button", { name: "Refresh history", exact: true }),
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
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: /Remember my pancakes/ }).click();
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

test("reports an unreachable backend without losing the login form", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:3101/**", (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeEnabled();
});

test("reload interrupts a reply and does not submit it again", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
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
  await expect(
    page.getByText("Writing a mock reply…", { exact: true }),
  ).toBeVisible();
  await page.reload();
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      submissions++;
  });
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByText(/Reply interrupted\. This partial reply was saved/),
  ).toBeVisible();
  await expect(page.locator(".composer-note")).toContainText(
    "Refresh history before sending again",
  );
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
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
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
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
  await expect(
    page.getByText("Writing a mock reply…", { exact: true }),
  ).toBeVisible();
  const partial = await reply.textContent();
  expect(partial?.length).toBeLessThan(content.length);
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await expect(reply).toContainText(content);
  await expect(page.getByText(/Reply interrupted/)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Enter sends, Shift+Enter inserts a line, and composing Enter does not send", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
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
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled();
});
