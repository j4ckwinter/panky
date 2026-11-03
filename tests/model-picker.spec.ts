import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";
import { audioFixture } from "./browser-audio-fixture.js";

for (const view of ["chat", "interview"]) {
  for (const viewport of [
    { width: 1280, height: 844 },
    { width: 390, height: 844 },
    { width: 390, height: 500 },
  ]) {
    test(`${view} selects from eight subscription models at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.route("**/api/connections/chatgpt/models", (route) =>
        route.fulfill({
          json: {
            models: Array.from({ length: 8 }, (_, index) => ({
              id: `model-${index + 1}`,
              name:
                index === 7
                  ? "Eighth model with a longer display name"
                  : `Model ${index + 1}`,
            })),
          },
        }),
      );
      if (view === "interview") {
        const capture = await audioFixture(page);
        await capture
          .getByRole("button", { name: "Start listening", exact: true })
          .click();
        await expect(
          capture.getByRole("button", { name: "Pause", exact: true }),
        ).toBeVisible();
      } else {
        await page.goto("/");
        await login(page);
      }
      await page.setViewportSize(viewport);
      const picker = page.getByRole("button", {
        name: "Answer model",
        exact: true,
      });
      await picker.click();
      const panel = page.getByRole("region", { name: "Choose answer model" });
      const options = panel.getByRole("radio");
      await expect(options).toHaveCount(9);
      const bounds = await panel.boundingBox();
      expect(bounds!.height).toBeLessThanOrEqual(320);
      expect(
        await panel.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await options.last().scrollIntoViewIfNeeded();
      expect(
        await panel.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0);
      await page.screenshot({
        path: `test-results/eight-models-${view}-${viewport.width}-${viewport.height}.png`,
      });
      await options.last().check();
      await expect(panel).toBeHidden();
      await expect(picker).toHaveAttribute(
        "title",
        "Answer model: ChatGPT · Eighth model with a longer display name",
      );
      await expect(picker).toBeFocused();
      await picker.click();
      await expect(options.last()).toBeChecked();
      await options.last().focus();
      await page.keyboard.press("ArrowDown");
      await expect(panel).toBeHidden();
      await expect(picker).toHaveAttribute("title", /Demo mode|Local AI/);
      if (view === "interview")
        await page.getByRole("button", { name: "Stop", exact: true }).click();
    });
  }
}
