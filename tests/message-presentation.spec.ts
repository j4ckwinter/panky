import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

test("assistant Markdown renders safely and fits mobile while user input stays literal", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  const content = [
    "Markdown example",
    "",
    "## A closure",
    "",
    "A **function** remembers its `scope`.",
    "",
    "- First item",
    "- Second item",
    "",
    "```javascript",
    "const closure = () => 'a very long line that should scroll inside the code block without widening the page';",
    "```",
    "",
    "| Name | Meaning |",
    "| --- | --- |",
    "| Scope | Variables |",
    "",
    "[Reference](https://example.com) [Unsafe](javascript:alert(1))",
    "",
    '<img src="https://example.com/tracker" onerror="alert(1)">',
    "![Remote image](https://example.com/tracker)",
    "",
  ].join("\n");
  let externalRequests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.com")) externalRequests++;
  });
  await page.getByLabel("Message", { exact: true }).fill(content);
  await page.getByLabel("Send message", { exact: true }).click();
  const reply = page.getByRole("article", {
    name: "Panky response",
    exact: true,
  });
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await expect(reply.getByRole("heading", { name: "A closure" })).toBeVisible();
  await expect(
    reply.locator("strong").filter({ hasText: /^function$/ }),
  ).toBeVisible();
  await expect(reply.locator("pre code")).toContainText("const closure");
  await expect(reply.getByRole("heading", { name: "A closure" })).toHaveCSS(
    "margin-top",
    "24px",
  );
  await expect(reply.getByRole("heading", { name: "A closure" })).toHaveCSS(
    "margin-bottom",
    "12px",
  );
  await expect(reply.locator("pre")).toHaveCSS("line-height", "22.5px");
  await expect(reply.getByRole("table")).toContainText("Variables");
  await expect(reply.getByRole("link", { name: "Reference" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(reply.getByRole("link", { name: "Unsafe" })).toHaveCount(0);
  await expect(reply.locator("img, script")).toHaveCount(0);
  expect(externalRequests).toBe(0);
  const user = page.getByRole("article", { name: "Your message", exact: true });
  await expect(user).toContainText("## A closure");
  await expect(user.locator("h2, pre, table")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await reply.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/markdown-${width}.png` });
  }
});

test("response details are hidden while streaming and cancellation stays reachable", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill("A long reply " + "word ".repeat(800));
  await page.getByLabel("Send message", { exact: true }).click();
  const activity = page.getByRole("region", {
    name: "Task activity",
    exact: true,
  });
  await expect(activity).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(
    page.getByText("Task cancelled. Any partial reply was saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(activity).toHaveCount(0);
});

test("next draft survives cancellation and sends only on request", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Long answer " + "word ".repeat(800));
  await input.press("Enter");
  await expect(page.getByLabel("Stop response", { exact: true })).toBeVisible();
  await expect(input).toBeEnabled();
  await input.fill("My next question");
  await input.press("Enter");
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(1);
  await page.getByLabel("Stop response", { exact: true }).click();
  await expect(page.getByLabel("Send message", { exact: true })).toBeEnabled();
  await expect(input).toHaveValue("My next question");
  await input.press("Enter");
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(2);
  await expect(input).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
});

test("next draft survives a completed reply without being submitted", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Complete this reply " + "word ".repeat(200));
  await input.press("Enter");
  await expect(page.getByLabel("Stop response", { exact: true })).toBeVisible();
  let releaseRefresh: (() => void) | undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() === "GET") await refreshGate;
    await route.continue();
  });
  await input.fill("Keep this draft");
  await expect(page.getByLabel("Stop response", { exact: true })).toHaveCount(
    0,
  );
  await expect(input).toBeEnabled();
  await expect(input).toBeFocused();
  releaseRefresh?.();
  await expect(page.getByLabel("Send message", { exact: true })).toBeEnabled();
  await expect(input).toHaveValue("Keep this draft");
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(1);
});

test("copy response and code write the expected text and report clipboard failures", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await login(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "Code example\n\n```javascript\nconst answer = 42;\n```\n\nEnd of example.",
    );
  await page.getByLabel("Send message", { exact: true }).click();
  const reply = page.getByRole("article", {
    name: "Panky response",
    exact: true,
  });
  await expect(reply.getByLabel("Copy response")).toBeVisible();
  await reply.getByLabel("Copy code").click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
  ).toBe("const answer = 42;\n");
  await expect(reply.locator(".code-toolbar")).toContainText("javascript");
  await reply.getByLabel("Copy response").click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
  ).toContain("```javascript\nconst answer = 42;");
  await expect(reply.locator(".reply-actions")).toContainText("Copied");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("Denied");
    };
  });
  await reply.getByLabel("Copy response").click();
  await expect(reply.locator(".reply-actions")).toContainText("Could not copy");
});
