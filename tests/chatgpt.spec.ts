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
    const picker = page
      .locator("form")
      .filter({ has: page.getByLabel("Message", { exact: true }) })
      .getByRole("combobox", { name: "Answer model" });
    await expect(picker).toHaveValue("");
    await picker.selectOption("synthetic-chatgpt");
    await expect(
      page.getByText(
        /Questions, chat context and relevant source passages are sent to OpenAI/,
      ),
    ).toBeVisible();
    const sent: unknown[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/messages$/.test(request.url()))
        sent.push(request.postDataJSON());
    });
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
    await picker.selectOption("");
    await expect(picker).toHaveValue("");
    await expect(page.getByText(/Using ChatGPT plan/)).toHaveCount(0);
  });
}

test("Interview uses the selected subscription only after accepting an audio question", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  const picker = panel.getByRole("combobox", { name: "Answer model" });
  await expect(picker).toBeVisible();
  await picker.selectOption("synthetic-chatgpt");
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
  const picker = page.getByRole("combobox", { name: "Answer model" });
  await expect(picker).toBeVisible();
  await picker.selectOption("synthetic-chatgpt");
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
  await expect(picker).toHaveValue("synthetic-chatgpt");
  await expect(
    page.getByText(/Messages are not switched automatically/),
  ).toBeVisible();
});
