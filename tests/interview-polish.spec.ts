import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import { audioFixture, expectReleased } from "./browser-audio-fixture.js";

for (const width of [1280, 390]) {
  test(`listening controls remain usable after scrolling at ${width}px`, async ({
    page,
  }) => {
    const panel = await audioFixture(page);
    await page.setViewportSize({ width, height: 500 });
    await page.evaluate(
      "window.speechTest.transcript('shared', 'What is a closure in JavaScript?')",
    );
    await panel
      .getByRole("button", { name: "Start listening", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send question", exact: true })
      .click({ timeout: 15000 });
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
    const scroll = page.locator(".interview-scroll");
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await scroll.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    const toolbar = await page.locator(".listening-welcome").boundingBox();
    const container = await scroll.boundingBox();
    expect(toolbar!.y).toBeGreaterThanOrEqual(container!.y);
    await page.screenshot({
      path: `test-results/sticky-listening-${width}.png`,
    });
    await panel.getByRole("button", { name: "Pause", exact: true }).click();
    await expectReleased(page);
    await expect(panel).toContainText("Paused — audio released");
  });
}
