import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

test("search, rename and confirmed deletion persist without affecting other chats", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  const input = page.getByLabel("Message", { exact: true });
  const send = async (text: string) => {
    await input.fill(text);
    await input.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "Refresh history",
        exact: true,
        includeHidden: true,
      }),
    ).toBeEnabled();
  };
  await send("Keep this conversation");
  await page.getByLabel("New conversation", { exact: true }).click();
  await send("Original conversation name");
  const search = page.getByLabel("Search chats", { exact: true });
  await search.fill("original");
  await expect(
    page.getByRole("button", { name: "Keep this conversation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Manage chat: Original conversation name", { exact: true })
    .click();
  const manage = page.getByRole("dialog", { name: "Manage chat", exact: true });
  await manage.getByLabel("Chat name").fill("Renamed conversation");
  await manage.getByRole("button", { name: "Save name" }).click();
  await expect(manage).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Renamed conversation", exact: true }),
  ).toBeVisible();
  await search.fill("renamed");
  await expect(
    page.getByRole("button", { name: "Renamed conversation", exact: true }),
  ).toBeVisible();
  await page.reload();
  await login(page);
  await page
    .getByRole("button", { name: "Renamed conversation", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toContainText("Original conversation name");
  await page
    .getByLabel("Manage chat: Renamed conversation", { exact: true })
    .click();
  await manage
    .getByRole("button", { name: "Delete chat", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete chat?",
    exact: true,
  });
  await confirmation.getByRole("button", { name: "Keep chat" }).click();
  await expect(manage).toBeVisible();
  await manage
    .getByRole("button", { name: "Delete chat", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Start a chat" }),
  ).toBeVisible();
  await page.reload();
  await login(page);
  await expect(
    page.getByRole("button", { name: "Renamed conversation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Keep this conversation", exact: true }),
  ).toBeVisible();
  await search.fill("no matching title");
  await expect(page.getByText("No matching chats.")).toBeVisible();
});

test("mobile chat management keeps a chat when deletion fails", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await login(page);
  await page.getByLabel("Message", { exact: true }).fill("Mobile management");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await page
    .getByLabel("Manage chat: Mobile management", { exact: true })
    .click();
  await page.getByRole("button", { name: "Delete chat", exact: true }).click();
  await page.route("**/api/conversations/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "This chat is still replying." }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "still replying",
  );
  await expect(
    page.getByRole("heading", { name: "Mobile management", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({ path: "test-results/chat-management-mobile.png" });
  await page.getByRole("button", { name: "Keep chat" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Conversations", exact: true }),
  ).toBeFocused();
});

test("mobile header starts a new chat and keeps refresh in an accessible menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await login(page);
  await page.getByLabel("Message", { exact: true }).fill("Mobile header test");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toHaveCount(0);
  const options = page.getByRole("button", {
    name: "Chat options",
    exact: true,
  });
  await options.click();
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(options).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Start new chat", exact: true }),
  ).toBeEnabled();
  await options.click();
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await expect(options).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Start new chat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start a chat" }),
  ).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await page.screenshot({ path: "test-results/mobile-header.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
