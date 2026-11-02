import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import { audioFixture } from "./browser-audio-fixture.js";

test("shared speech becomes an editable general question and sends once only on acceptance", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.getByText("Ask a question", { exact: true }).click();
  await page.getByText("Experience sample (optional)", { exact: true }).click();
  await page
    .getByLabel("Your experience sample", { exact: true })
    .fill("PRIVATE EXPERIENCE SHOULD NOT BE SENT");
  await page.getByText("Ask a question", { exact: true }).click();
  await page.evaluate(() => {
    const fixture = (
      window as unknown as {
        speechTest: { transcript(source: string, text: string): void };
      }
    ).speechTest;
    fixture.transcript("shared", "What is a closure in JavaScript?");
    fixture.transcript("microphone", "What is a private microphone question?");
  });
  const submissions: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url()))
      submissions.push(request.postDataJSON());
  });
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const cards = page.getByRole("region", {
    name: "Detected questions",
    exact: true,
  });
  const card = cards.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(card.getByLabel("Question to ask", { exact: true })).toHaveValue(
    "What is a closure in JavaScript?",
  );
  expect(submissions).toHaveLength(0);
  await card
    .getByLabel("Question to ask", { exact: true })
    .fill("Explain a JavaScript closure with a short example.");
  await card
    .getByRole("button", { name: "Use this question", exact: true })
    .dblclick();
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await expect(answer).toContainText(
    "Explain a JavaScript closure with a short example.",
  );
  await expect(answer).toContainText("Immediate cues");
  await expect(card).toContainText("Sent to model");
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    content: "Explain a JavaScript closure with a short example.",
    interview: { experience: "", context: [], useExperience: false },
  });
  expect(JSON.stringify(submissions)).not.toContain("PRIVATE EXPERIENCE");
  await expect(card).not.toContainText("private microphone question");
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How does lexical scope work?')",
  );
  await expect(
    cards.getByRole("article", { name: "Detected question", exact: true }),
  ).toHaveCount(2, { timeout: 15000 });
  await expect(answer).toContainText(
    "Explain a JavaScript closure with a short example.",
  );
  expect(submissions).toHaveLength(1);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await cards.screenshot({ path: "test-results/spoken-question-cards.png" });
});

test("dismissed shared questions do not reappear and unrecognized speech can be selected manually", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'What is a closure in JavaScript?')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const cards = page.getByRole("region", {
    name: "Detected questions",
    exact: true,
  });
  await expect(
    cards.getByLabel("Question to ask", { exact: true }),
  ).toHaveValue("What is a closure in JavaScript?", { timeout: 15000 });
  await cards
    .getByRole("button", { name: "Dismiss question", exact: true })
    .click();
  await page.waitForTimeout(5500);
  await expect(
    cards.getByRole("article", { name: "Detected question", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'JavaScript scope and lifetime')",
  );
  const transcript = panel.getByRole("region", {
    name: "Live transcript",
    exact: true,
  });
  const segment = transcript
    .locator("article")
    .filter({ hasText: "JavaScript scope and lifetime" })
    .first();
  await expect(segment).toBeVisible({ timeout: 10000 });
  await segment
    .getByRole("button", { name: "Use as question", exact: true })
    .click();
  await expect(
    cards.getByLabel("Question to ask", { exact: true }),
  ).toHaveValue("JavaScript scope and lifetime");
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("failed spoken submissions are not retried automatically", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'What is a closure in JavaScript?')",
  );
  let attempts = 0;
  await page.route("**/api/conversations/*/messages", async (route) => {
    attempts++;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Controlled provider failure" }),
    });
  });
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card
    .getByLabel("Question to ask", { exact: true })
    .press("Control+Enter");
  await expect(card).toContainText("Submission not confirmed");
  await expect(page.getByRole("alert")).toContainText(
    "Controlled provider failure",
  );
  await page.waitForTimeout(1500);
  expect(attempts).toBe(1);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("question detection waits for the next audio chunk and resets on Stop", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Can you explain how closures work')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const transcript = panel.getByRole("region", {
    name: "Live transcript",
    exact: true,
  });
  await expect(transcript).toContainText("Can you explain how closures work", {
    timeout: 15000,
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'in JavaScript and give an example?')",
  );
  await page.waitForTimeout(2000);
  const cards = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(cards).toHaveCount(0);
  await expect(cards.getByLabel("Question to ask")).toHaveValue(
    "Can you explain how closures work in JavaScript and give an example?",
    { timeout: 10000 },
  );
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Tell me about the')",
  );
  await expect(transcript).toContainText("Tell me about the", {
    timeout: 10000,
  });
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await page.evaluate(
    "window.speechTest.transcript('shared', 'What is lexical scope?')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  await expect(cards.last().getByLabel("Question to ask")).toHaveValue(
    "What is lexical scope?",
  );
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("region", { name: "Detected questions" })
    .screenshot({ path: "test-results/spoken-question-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("accepted spoken questions can be stopped without resubmission", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How would you design a reliable service?')",
  );
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url()))
      submissions++;
  });
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop response", exact: true })
    .click();
  await expect(
    page.getByText("Stopped. Partial talking points are saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(card).toContainText("Sent to model");
  expect(submissions).toBe(1);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
