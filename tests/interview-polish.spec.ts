import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import {
  audioFixture,
  expectReleased,
  submitAudioQuestion,
} from "./browser-audio-fixture.js";

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
    await expect(
      page.getByRole("button", { name: "Send question", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: `test-results/listening-question-${width}.png`,
    });
    await page.setViewportSize({ width, height: 500 });
    await page
      .getByRole("button", { name: "Send question", exact: true })
      .click({ timeout: 15000 });
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".interview-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `test-results/listening-workspace-${width}.png`,
    });
    await page.setViewportSize({ width, height: 500 });
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

test("answer copy preserves Markdown and reports clipboard failure on mobile", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await audioFixture(page);
  const content =
    "Two points:\n\n- First point\n- Second point\n\n```javascript\nconst example = '" +
    "long ".repeat(40) +
    "';\n```";
  await page.route("**/api/conversations/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    for (const message of body.messages ?? [])
      if (message.role === "assistant") message.content = content;
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/conversations/*/messages", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .split("\n")
      .map((line) => {
        if (!line.startsWith("data: ")) return line;
        const event = JSON.parse(line.slice(6));
        if (event.type === "delta") event.text = "";
        if (event.type === "done") event.message.content = content;
        return `data: ${JSON.stringify(event)}`;
      })
      .join("\n");
    await route.fulfill({ response, body });
  });
  await submitAudioQuestion(page, "Explain closures?");
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await answer
    .getByRole("button", { name: "Copy answer", exact: true })
    .click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
  ).toBe(content);
  await expect(answer.locator(".copy-status").first()).toHaveText("Copied");
  await expect(answer.locator(".markdown li").first()).toHaveCSS(
    "margin-top",
    "4px",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(answer.locator("pre")).toHaveCSS("overflow-x", "auto");
  await page.screenshot({ path: "test-results/interview-copy-mobile.png" });
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("Denied");
    };
  });
  await answer
    .getByRole("button", { name: "Copy answer", exact: true })
    .click();
  await expect(answer).toContainText(
    "Could not copy. Select the text instead.",
  );
});

test("New topic belongs to listening controls and resets context without removing history", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  const submissions: Array<{ interview: { context: unknown[] } }> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url()))
      submissions.push(request.postDataJSON());
  });
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
  const controls = page.getByRole("region", {
    name: "Detected questions",
    exact: true,
  });
  await expect(
    page
      .locator(".sent-questions")
      .getByRole("button", { name: "New topic", exact: true }),
  ).toHaveCount(0);
  await panel
    .locator(".listening-controls")
    .getByRole("button", { name: "New topic", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "New topic", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Sent questions (1)", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How does lexical scope work?')",
  );
  await controls
    .getByRole("button", { name: "Send question", exact: true })
    .click({ timeout: 15000 });
  await expect(
    page.getByText("Sent questions (2)", { exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]?.interview.context).toEqual([]);
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/interview-topic-controls.png" });
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
