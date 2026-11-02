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

test("new questions highlight without taking focus or moving the answer", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.setViewportSize({ width: 1280, height: 500 });
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
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await answer.focus();
  await answer.evaluate((element) => {
    element.scrollTop = 80;
  });
  const before = await answer.evaluate((element) => element.scrollTop);
  const outer = await page
    .locator(".interview-scroll")
    .evaluate((element) => element.scrollTop);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How does lexical scope work?')",
  );
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toHaveCSS("animation-name", "question-arrival");
  await expect(answer).toBeFocused();
  expect(await answer.evaluate((element) => element.scrollTop)).toBe(before);
  expect(
    await page
      .locator(".interview-scroll")
      .evaluate((element) => element.scrollTop),
  ).toBe(outer);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card).toHaveCSS("animation-name", "none");
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
