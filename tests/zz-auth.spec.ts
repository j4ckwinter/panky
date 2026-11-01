import { expect } from "@playwright/test";
import { login, mockGoogle, test, token } from "./auth-fixture.js";

const origin = "http://localhost:5174";
test("Google sessions survive reload, stay out of scripts, and logout revokes access", async ({
  page,
  context,
}) => {
  await page.goto("/");
  let assertion: unknown;
  page.on("request", (request) => {
    if (request.url().endsWith("/auth/google/verify"))
      assertion = request.postDataJSON();
  });
  await login(page);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "panky-google-session",
  );
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  const storage = await page.evaluate(() => ({
    cookie: document.cookie,
    persistent: JSON.stringify({ ...localStorage, ...sessionStorage }),
  }));
  expect(storage.cookie).not.toContain("panky-google-session");
  expect(storage.persistent).not.toContain(cookie?.value);
  expect(storage.persistent).not.toContain(token);
  const replay = await context.request.post("/api/auth/google/verify", {
    headers: { Origin: origin },
    data: assertion,
  });
  expect(replay.status()).toBe(401);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Start a chat" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toBeVisible();
  const denied = await context.request.get("/api/conversations", {
    headers: { Cookie: `panky-google-session=${cookie?.value}` },
  });
  expect(denied.status()).toBe(401);
  await login(page);
});

test("uninvited Google accounts cannot sign in", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  try {
    await mockGoogle(context, "uninvited@gmail.com");
    const page = await context.newPage();
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sign in with Google", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
    expect((await context.request.get("/api/conversations")).status()).toBe(
      401,
    );
  } finally {
    await context.close();
  }
});

test("owner invites a friend, chats stay private, and removing access ends their sessions", async ({
  page,
  browser,
}) => {
  const friendEmail = "browser-friend@gmail.com";
  await page.goto("/");
  await login(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Owner-only conversation");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "People", exact: true }).click();
  const people = page.getByRole("dialog", { name: "People with access" });
  await people
    .getByRole("textbox", { name: "Google account email", exact: true })
    .fill(friendEmail);
  await people.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(people.getByText(friendEmail, { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL: origin });
  try {
    await mockGoogle(context, friendEmail);
    const friend = await context.newPage();
    await friend.setViewportSize({ width: 390, height: 844 });
    await friend.goto("/");
    await login(friend);
    await expect(
      friend.getByRole("button", { name: "People", exact: true }),
    ).toHaveCount(0);
    const list = await context.request.get("/api/conversations");
    expect(await list.json()).toEqual([]);
    await friend
      .getByLabel("Message", { exact: true })
      .fill("Friend-only conversation");
    await friend
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      friend.getByRole("button", { name: "Refresh history", exact: true }),
    ).toBeEnabled();
    await friend.screenshot({ path: "test-results/google-member-mobile.png" });
    await people.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Refresh history", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Friend-only conversation",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "People", exact: true }).click();
    await people
      .getByRole("button", {
        name: `Remove access for ${friendEmail}`,
        exact: true,
      })
      .click();
    await people
      .getByRole("button", { name: "Remove access", exact: true })
      .click();
    await expect(people.getByText(friendEmail, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "test-results/google-owner-access.png" });
    await friend.reload();
    await expect(
      friend.getByRole("button", { name: "Sign in with Google", exact: true }),
    ).toBeVisible();
    expect((await context.request.get("/api/conversations")).status()).toBe(
      401,
    );
  } finally {
    await context.close();
  }
});
