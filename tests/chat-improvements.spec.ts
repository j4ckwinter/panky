import { expect, type Page, test } from "@playwright/test";

const token = "panky-browser-test-token-never-use-in-production";
async function connect(page: Page) {
  await page.goto("/");
  await login(page);
}
async function login(page: Page) {
  await page
    .getByRole("textbox", { name: "Access token", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled();
}
async function send(page: Page, content: string) {
  await page.getByLabel("Message", { exact: true }).fill(content);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled();
}

test("new tabs start blank without creating records; reload restores only that tab's chat", async ({
  page,
  context,
}) => {
  let creates = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/conversations"))
      creates++;
  });
  await connect(page);
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What’s on your mind?" }),
  ).toBeVisible();
  expect(creates).toBe(0);
  await send(page, "First window conversation");
  expect(creates).toBe(1);
  const second = await context.newPage();
  await connect(second);
  await expect(second.getByRole("article")).toHaveCount(0);
  await expect(second.getByLabel("Message", { exact: true })).toBeEnabled();
  await send(second, "Second window conversation");
  await page.reload();
  await login(page);
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveText(/First window conversation/);
  await expect(page.getByRole("article")).toHaveCount(2);
  await second.reload();
  await login(second);
  await expect(
    second.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveText(/Second window conversation/);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.reload();
  await login(page);
  await expect(page.getByRole("article")).toHaveCount(0);
  await second.close();
});

test("failed first submission preserves draft and does not create another conversation on manual retry", async ({
  page,
}) => {
  await connect(page);
  let creates = 0;
  let sends = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/conversations"))
      creates++;
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      sends++;
  });
  await page.route("**/api/conversations/*/messages", (route) =>
    route.abort("connectionrefused"),
  );
  await page.getByLabel("Message", { exact: true }).fill("Keep first draft");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep first draft",
  );
  expect(creates).toBe(1);
  expect(sends).toBe(1);
  await page.unroute("**/api/conversations/*/messages");
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled();
  expect(creates).toBe(1);
  expect(sends).toBe(2);
});
