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
    page.getByLabel("Refresh history", { exact: true }),
  ).toBeEnabled();
  await expect(reply.getByRole("heading", { name: "A closure" })).toBeVisible();
  await expect(
    reply.locator("strong").filter({ hasText: /^function$/ }),
  ).toBeVisible();
  await expect(reply.locator("pre code")).toContainText("const closure");
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

test("activity remains compact during streaming and cancellation stays reachable", async ({
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
  await expect(activity.getByText("Running", { exact: true })).toBeVisible();
  await expect(activity.locator("details").first()).not.toHaveAttribute("open");
  await expect(
    activity.getByRole("button", { name: "Cancel task" }),
  ).toBeVisible();
  await activity.getByRole("button", { name: "Cancel task" }).click();
  await expect(activity.getByText("Cancelled", { exact: true })).toBeVisible();
  await activity.locator("summary").first().click();
  await expect(activity.getByLabel("Task timeline")).toBeVisible();
});
