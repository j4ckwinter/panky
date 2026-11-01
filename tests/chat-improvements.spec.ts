import { expect, type Page } from "@playwright/test";

import { test, login } from "./auth-fixture.js";
async function connect(page: Page) {
  await page.goto("/");
  await login(page);
}
async function send(page: Page, content: string) {
  await page.getByLabel("Message", { exact: true }).fill(content);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
}

test("new tabs and reconnects start blank without creating records", async ({
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
    .getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start a chat" }),
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
  await expect(page.getByRole("article")).toHaveCount(0);
  await page
    .getByRole("button", { name: "First window conversation", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveText(/First window conversation/);
  await expect(page.getByRole("article")).toHaveCount(2);
  await second.reload();
  await login(second);
  await expect(second.getByRole("article")).toHaveCount(0);
  await second
    .getByRole("button", { name: "Second window conversation", exact: true })
    .click();
  await expect(
    second.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveText(/Second window conversation/);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.reload();
  await login(page);
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(creates).toBe(1);
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
    .getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  expect(creates).toBe(1);
  expect(sends).toBe(2);
});

test("streaming respects reading position and Jump to latest resumes following", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await connect(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "Reading position\n" +
        "A line to read while the reply streams.\n".repeat(150),
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const reply = page.getByRole("article", {
    name: "Panky response",
    exact: true,
  });
  await expect(reply).toContainText("This is a mock response");
  const area = page.locator(".chat-scroll");
  await area.evaluate((element) => {
    element.scrollTop = 0;
  });
  const jump = page.getByRole("button", {
    name: "Jump to latest ↓",
    exact: true,
  });
  await expect(jump).toBeVisible();
  const initialLength = (await reply.textContent())?.length ?? 0;
  await expect
    .poll(async () => (await reply.textContent())?.length ?? 0)
    .toBeGreaterThan(initialLength + 300);
  expect(await area.evaluate((element) => element.scrollTop)).toBeLessThan(5);
  await page.screenshot({ path: "test-results/reading-position.png" });
  await jump.click();
  await expect(jump).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled({ timeout: 20000 });
  await expect
    .poll(() =>
      area.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(5);
  await area.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(jump).toBeVisible();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(jump).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Start a chat" }),
  ).toBeVisible();
  await expect
    .poll(() => area.evaluate((element) => element.scrollTop))
    .toBe(0);
  await page.screenshot({ path: "test-results/fresh-chat.png" });
});

test("drafts stay with each conversation and the fresh chat until accepted", async ({
  page,
}) => {
  await connect(page);
  await send(page, "Draft conversation A");
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Unsent A\nsecond line");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(input).toHaveValue("");
  await input.fill("Unsent fresh chat");
  await page
    .getByRole("button", { name: "Draft conversation A", exact: true })
    .click();
  await expect(input).toHaveValue("Unsent A\nsecond line");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(input).toHaveValue("Unsent fresh chat");
  await send(page, "Draft conversation B");
  await expect(input).toHaveValue("");
  await input.fill("Unsent B");
  await page
    .getByRole("button", { name: "Draft conversation A", exact: true })
    .click();
  await expect(input).toHaveValue("Unsent A\nsecond line");
  await page
    .getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    })
    .click();
  await expect(input).toHaveValue("Unsent A\nsecond line");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await expect(input).toHaveValue("");
  await page
    .getByRole("button", { name: "Draft conversation B", exact: true })
    .click();
  await expect(input).toHaveValue("Unsent B");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(input).toHaveValue("");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("Unsent");
});

test("failed conversation creation keeps the fresh draft", async ({ page }) => {
  await connect(page);
  await page.route("**/api/conversations", (route) =>
    route.request().method() === "POST"
      ? route.abort("connectionrefused")
      : route.continue(),
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill("Creation failed draft");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Creation failed draft",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.unroute("**/api/conversations");
  await send(page, "Creation failed draft");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(1);
});

test("each reply owns its task activity after more messages and reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await connect(page);
  await send(page, "What is the current date and time?");
  await send(page, "A separate thought");
  const replies = page.getByRole("article", {
    name: "Panky response",
    exact: true,
  });
  await expect(replies).toHaveCount(2);
  const firstActivity = replies
    .nth(0)
    .getByRole("region", { name: "Task activity", exact: true });
  const secondActivity = replies
    .nth(1)
    .getByRole("region", { name: "Task activity", exact: true });
  await expect(firstActivity).toHaveCount(1);
  await expect(firstActivity.locator("summary").first()).toContainText(
    "Used 1 tool",
  );
  await expect(secondActivity).toHaveCount(1);
  await expect(secondActivity.locator("summary").first()).toHaveText(
    "Response details",
  );
  await firstActivity.locator("summary").first().click();
  await firstActivity.getByText("View tool result", { exact: true }).click();
  await expect(
    firstActivity.getByLabel("Tool result", { exact: true }),
  ).toContainText("timestamp");
  const result = await firstActivity
    .getByLabel("Tool result", { exact: true })
    .textContent();
  await secondActivity.locator("summary").first().click();
  await expect(
    secondActivity.getByText("Conversation prepared", { exact: true }),
  ).toBeVisible();
  await expect(
    secondActivity.getByText("View tool result", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await login(page);
  await page
    .getByRole("button", {
      name: "What is the current date and time?",
      exact: true,
    })
    .click();
  await expect(replies).toHaveCount(2);
  await expect(firstActivity).toHaveCount(1);
  await expect(secondActivity).toHaveCount(1);
  await firstActivity.locator("summary").first().click();
  await firstActivity.getByText("View tool result", { exact: true }).click();
  await expect(
    firstActivity.getByLabel("Tool result", { exact: true }),
  ).toHaveText(result ?? "");
  await firstActivity.locator("summary").first().click();
  await page.locator(".chat-scroll").evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeLessThan(48);
  await expect(
    page.getByRole("button", { name: "Jump to latest ↓", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/per-reply-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await secondActivity.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/per-reply-mobile.png" });
});

test("composer aligns send with input and grows for multiline drafts on desktop and mobile", async ({
  page,
}) => {
  await connect(page);
  const input = page.getByLabel("Message", { exact: true });
  const button = page.getByRole("button", {
    name: "Send message",
    exact: true,
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await input.fill("A short message");
    const composer = await page.locator(".composer").boundingBox();
    expect(composer?.y).toBeLessThan(844 * 0.8);
    await expect(
      page.getByText("Enter to send · Shift+Enter for a new line", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const field = await input.boundingBox();
        const send = await button.boundingBox();
        if (!field || !send) return 999;
        return Math.abs(field.y + field.height / 2 - send.y - send.height / 2);
      })
      .toBeLessThan(2);
    await page.screenshot({ path: `test-results/composer-${width}.png` });
    await input.fill("First line\nSecond line\nThird line");
    await expect
      .poll(() => input.evaluate((element) => element.clientHeight))
      .toBeGreaterThan(80);
    await expect
      .poll(async () => {
        const field = await input.boundingBox();
        const send = await button.boundingBox();
        if (!field || !send) return 999;
        return Math.abs(field.y + field.height - send.y - send.height);
      })
      .toBeLessThan(2);
    await input.fill("A long draft\n".repeat(30));
    expect(
      await input.evaluate((element) => element.clientHeight),
    ).toBeLessThanOrEqual(160);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await input.fill("");
    await expect
      .poll(() => input.evaluate((element) => element.clientHeight))
      .toBe(40);
  }
});

test("connection page keeps the form usable at desktop and mobile sizes", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with Google", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/connection-${width}.png` });
  }
});

test("empty chat and composer stay reachable in a short mobile window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await connect(page);
  const welcome = page.getByRole("heading", {
    name: "Start a chat",
    exact: true,
  });
  await welcome.scrollIntoViewIfNeeded();
  await expect(welcome).toBeInViewport();
  const input = page.getByLabel("Message", { exact: true });
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("desktop sidebar collapses, expands and preserves the current draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await connect(page);
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Keep this while collapsing");
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Conversation history" }),
  ).toBeHidden();
  await expect(input).toHaveValue("Keep this while collapsing");
  await page.screenshot({ path: "test-results/chat-sidebar-collapsed.png" });
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Conversation history" }),
  ).toBeVisible();
  await expect(input).toHaveValue("Keep this while collapsing");
  await page
    .getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    })
    .screenshot({ path: "test-results/refresh-icon.png" });
});
