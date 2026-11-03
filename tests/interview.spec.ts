import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";
import { audioFixture, expectReleased } from "./browser-audio-fixture.js";

for (const width of [1280, 390]) {
  test(`Interview has only the live workflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await login(page);
    if (width < 640)
      await page
        .getByRole("button", { name: "Conversations", exact: true })
        .click();
    await page.getByRole("button", { name: "Interview", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Start listening", exact: true }),
    ).toBeVisible();
    for (const name of [
      "Interview options",
      "Load speech model",
      "Remove downloaded model",
      "Get response",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    await expect(
      page.getByRole("checkbox", { name: "Use my sources" }),
    ).toHaveCount(0);
    await expect(page.getByText("Ask a question", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText(/Hugging Face/)).toHaveCount(0);
    await expect(
      page.getByLabel("Interview question", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/interview-simplified-${width}.png`,
    });
  });
}

test("Connections navigation releases capture and returning does not restart it", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expectReleased(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start listening", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    1,
  );
});
