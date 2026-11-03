import { expect } from "@playwright/test";
import { audioFixture } from "./browser-audio-fixture.js";
import { test } from "./auth-fixture.js";
import { openConnectionsCatalogue } from "./connections-fixture.js";

for (const width of [1280, 390]) {
  test(`owner selects subscription answers and opens connection details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openConnectionsCatalogue(page);
    await page
      .getByRole("button", { name: "View ChatGPT connection", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "ChatGPT connection" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Disconnect ChatGPT", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/connection=chatgpt/);
    await page.screenshot({
      path: `test-results/chatgpt-connection-${width}.png`,
      fullPage: true,
    });
    if (width < 640)
      await page
        .getByRole("button", { name: "Connections navigation", exact: true })
        .click();
    await page.getByRole("button", { name: "Chats", exact: true }).click();
    const sent: unknown[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/messages$/.test(request.url()))
        sent.push(request.postDataJSON());
    });
    const picker = page
      .locator("form")
      .filter({ has: page.getByLabel("Message", { exact: true }) })
      .getByRole("button", { name: "Answer model", exact: true });
    await expect(picker).toHaveAttribute("title", /Local AI|Demo mode/);
    await picker.focus();
    await picker.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(picker).toHaveAttribute(
      "title",
      "Answer model: ChatGPT · Synthetic ChatGPT",
    );
    await picker.click();
    const choices = page.getByRole("region", { name: "Choose answer model" });
    await expect(
      page.getByRole("radio", { name: "Synthetic ChatGPT", exact: true }),
    ).toBeChecked();
    await page.screenshot({ path: `test-results/model-picker-${width}.png` });
    const bounds = await choices.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(choices).toBeHidden();
    await expect(picker).toBeFocused();
    const modelBox = await picker.boundingBox();
    expect(modelBox!.width).toBe(40);
    const message = page.getByLabel("Message", { exact: true });
    const composer = page.locator("form").filter({ has: message });
    const border = await composer.evaluate(
      (element) => getComputedStyle(element).borderColor,
    );
    await message.fill("A long draft that stays on one line. ".repeat(20));
    await picker.click();
    await page
      .getByRole("radio", { name: "Synthetic ChatGPT", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(choices).toBeHidden();
    await expect(message).toHaveValue(
      "A long draft that stays on one line. ".repeat(20),
    );
    expect(sent).toHaveLength(0);
    await message.focus();
    expect((await message.boundingBox())!.height).toBeLessThanOrEqual(40);
    expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(
      await composer.evaluate(
        (element) => getComputedStyle(element).borderColor,
      ),
    ).toBe(border);
    await page.screenshot({
      path: `test-results/single-row-chat-${width}.png`,
    });
    await expect(
      page.getByText(
        /Questions, chat context and relevant source passages are sent to OpenAI/,
      ),
    ).toBeVisible();
    await page
      .getByLabel("Message", { exact: true })
      .fill("Explain event processing");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Subscription response: Explain event processing", {
        exact: true,
      }),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      modelSelection: { provider: "chatgpt", model: "synthetic-chatgpt" },
    });
    await page.screenshot({
      path: `test-results/chatgpt-answer-${width}.png`,
      fullPage: true,
    });
    await picker.click();
    await page.getByRole("radio").first().check();
    await expect(picker).toHaveAttribute("title", /Local AI|Demo mode/);
    await expect(page.getByText(/Using ChatGPT plan/)).toHaveCount(0);
  });
}

test("Interview uses the selected subscription only after accepting an audio question", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  const picker = panel.getByRole("button", {
    name: "Answer model",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.click();
  await page
    .getByRole("radio", { name: "Synthetic ChatGPT", exact: true })
    .check();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: `test-results/interview-model-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 844 });
  const sent: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url()))
      sent.push(request.postDataJSON());
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Explain event processing?')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const question = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(question).toHaveCount(1, { timeout: 15000 });
  expect(sent).toHaveLength(0);
  await question
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    modelSelection: { provider: "chatgpt", model: "synthetic-chatgpt" },
    interview: { inputSource: "speech" },
  });
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("failed remote revocation shows local disconnection without changing the selected model", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("button", {
    name: "Answer model",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.click();
  await page
    .getByRole("radio", { name: "Synthetic ChatGPT", exact: true })
    .check();
  let disconnected = false;
  await page.route("**/api/connections/chatgpt", (route) => {
    if (route.request().method() === "DELETE") {
      disconnected = true;
      return route.fulfill({
        status: 502,
        json: {
          error:
            "Disconnected locally. Remote revocation was not confirmed; disconnect Panky in ChatGPT Settings too.",
        },
      });
    }
    return disconnected
      ? route.fulfill({ json: { kind: "disconnected" } })
      : route.continue();
  });
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", { name: "View ChatGPT connection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnect ChatGPT", exact: true })
    .click();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Remote revocation was not confirmed/),
  ).toBeVisible();
  await expect(
    page.getByText("pnpm connect:chatgpt", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(picker).toHaveAttribute(
    "title",
    /synthetic-chatgpt|Synthetic ChatGPT/,
  );
  await picker.click();
  const unavailable = page.getByRole("radio", {
    name: /synthetic-chatgpt|Synthetic ChatGPT/,
  });
  await expect(unavailable).toBeChecked();
  await expect(unavailable).toBeDisabled();
  await page.getByLabel("Message", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Choose answer model" }),
  ).toBeHidden();
  await expect(
    page.getByText(/Messages are not switched automatically/),
  ).toBeVisible();
});
