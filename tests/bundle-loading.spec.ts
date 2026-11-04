import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

const markdownChunk = /\/MarkdownContent(?:\.tsx|-[^/]+\.js)(?:\?.*)?$/;

for (const failure of [false, true]) {
  test(`Markdown loads only for a reply and keeps text readable when ${failure ? "unavailable" : "delayed"}`, async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    let submissions = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/messages$/.test(request.url()))
        submissions++;
    });
    await page.route(markdownChunk, async (route) => {
      requested = true;
      await held;
      if (failure) await route.abort();
      else await route.continue();
    });
    try {
      await page.goto("/");
      await login(page);
      expect(requested).toBe(false);
      await page
        .getByLabel("Message", { exact: true })
        .fill("Markdown example\n\n## Deferred reply\n\nBody");
      await page.getByLabel("Send message", { exact: true }).click();
      const reply = page.getByRole("article", {
        name: "Panky response",
        exact: true,
      });
      await expect(reply.locator(".markdown-plain")).toContainText(
        "## Deferred reply",
      );
      expect(requested).toBe(true);
      await page.getByLabel("Message", { exact: true }).fill("My next draft");
      const failedRequest = failure
        ? page.waitForEvent("requestfailed", {
            predicate: (request) => markdownChunk.test(request.url()),
          })
        : undefined;
      release();
      if (failure) {
        await failedRequest;
        await expect(reply.getByRole("status")).toHaveText(
          "Formatting unavailable. Showing plain text.",
        );
        await expect(reply.locator(".markdown-plain")).toContainText(
          "## Deferred reply",
        );
      } else {
        await expect(
          reply.getByRole("heading", { name: "Deferred reply" }),
        ).toBeVisible();
        await expect(reply.locator(".markdown-plain")).toHaveCount(0);
      }
      await expect(
        page.getByRole("button", {
          name: "Refresh history",
          exact: true,
          includeHidden: true,
        }),
      ).toBeEnabled();
      await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
        "My next draft",
      );
      expect(submissions).toBe(1);
    } finally {
      release();
    }
  });
}
