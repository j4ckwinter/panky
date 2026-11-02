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
  await expect(panel.locator(".transcript-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(
    card.getByLabel("Question to ask", { exact: true }),
  ).toBeInViewport();
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
  await expect(answer.locator(".interview-response")).toContainText(
    "Synthetic example only",
  );
  await expect(
    page.getByRole("button", { name: "Stop response", exact: true }),
  ).toBeEnabled();
  await expect(answer).toContainText("Suggested approach");
  await expect(answer.locator(".interview-response")).toBeInViewport();
  await expect(answer).not.toContainText("Immediate cues");
  await expect(answer).not.toContainText("Supporting detail");
  await page.getByText("Response timing", { exact: true }).click();
  const timing = page.locator(".response-timing");
  await expect(timing.locator("dd").nth(0)).toHaveText("42 ms");
  await expect(timing.locator("dd").nth(1)).toHaveText(/\d+ ms/);
  await expect(timing.locator("dd").nth(2)).toHaveText(/\d+ ms/);
  const firstTextTime = await timing.locator("dd").nth(2).textContent();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await expect(timing.locator("dd").nth(2)).toHaveText(firstTextTime!);
  await page.getByText("Response timing", { exact: true }).click();
  await page.screenshot({
    path: "test-results/interview-workspace-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answer.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/interview-workspace-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByText("Sent questions (1)", { exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    content: "Explain a JavaScript closure with a short example.",
    interview: { experience: "", context: [], useExperience: false },
  });
  expect(JSON.stringify(submissions)).not.toContain("PRIVATE EXPERIENCE");
  await expect(card).toHaveCount(0);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How does lexical scope work?')",
  );
  await expect(
    cards.getByRole("article", { name: "Detected question", exact: true }),
  ).toHaveCount(1, { timeout: 15000 });
  await expect(answer).toContainText(
    "Explain a JavaScript closure with a short example.",
  );
  expect(submissions).toHaveLength(1);
  await cards
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toMatchObject({
    content: "How does lexical scope work?",
    interview: {
      experience: "",
      useExperience: false,
      context: [
        {
          question: "Explain a JavaScript closure with a short example.",
          spokenAnswer: "",
        },
      ],
    },
  });
  expect(JSON.stringify(submissions[1])).not.toContain("Synthetic example");
  expect(JSON.stringify(submissions[1])).not.toContain("PRIVATE EXPERIENCE");
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
  await panel.locator(".transcript-details > summary").click();
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
  await page.getByText("Response timing", { exact: true }).click();
  await expect(page.locator(".response-timing")).toContainText(
    "No response text received",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Controlled provider failure",
  );
  await page.waitForTimeout(1500);
  expect(attempts).toBe(1);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("question detection waits for three audio chunks and resets on Stop", async ({
  page,
}) => {
  test.setTimeout(45000);
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Can you explain how closures work')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await panel.locator(".transcript-details > summary").click();
  const transcript = panel.getByRole("region", {
    name: "Live transcript",
    exact: true,
  });
  await expect(transcript).toContainText("Can you explain how closures work", {
    timeout: 15000,
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'when callbacks run asynchronously')",
  );
  await page.waitForTimeout(2000);
  const cards = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(cards).toHaveCount(0);
  await expect(transcript).toContainText("when callbacks run asynchronously", {
    timeout: 10000,
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'and give an example?')",
  );
  await expect(cards.getByLabel("Question to ask")).toHaveValue(
    "Can you explain how closures work when callbacks run asynchronously and give an example?",
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
    page.getByText("Stopped. Partial response is saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Sent questions (1)", { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("long answers stay in the workspace and can be scrolled with the keyboard", async ({
  page,
}) => {
  await audioFixture(page);
  const opening =
    "A closure retains access to its lexical environment.\n\n".repeat(60);
  await page.route("**/api/conversations/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    for (const message of body.messages ?? []) {
      if (message.role === "assistant")
        message.content = opening + message.content;
    }
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/conversations/*/messages", async (route) => {
    const response = await route.fetch();
    let expanded = false;
    const body = (await response.text())
      .split("\n")
      .map((line) => {
        if (!line.startsWith("data: ")) return line;
        const event = JSON.parse(line.slice(6));
        if (event.type === "delta" && !expanded) {
          expanded = true;
          event.text = opening + event.text;
        }
        if (event.type === "done")
          event.message.content = opening + event.message.content;
        return `data: ${JSON.stringify(event)}`;
      })
      .join("\n");
    await route.fulfill({ response, body });
  });
  await page.getByText("Ask a question", { exact: true }).click();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Explain closures");
  await page.getByRole("button", { name: "Get response", exact: true }).click();
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await expect(answer).toContainText("lexical environment");
  await expect(answer).toBeInViewport();
  await answer.focus();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => answer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const size = await answer.boundingBox();
  expect(size!.height).toBeLessThan(700);
});

test("a second question without punctuation settles while shared audio continues", async ({
  page,
}) => {
  test.setTimeout(45000);
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'What is a closure in JavaScript?')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const cards = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(cards).toHaveCount(1, { timeout: 15000 });
  await cards
    .first()
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Explain how the JavaScript event loop works.')",
  );
  await expect(cards).toHaveCount(1, { timeout: 24000 });
  await expect(cards.last().getByLabel("Question to ask")).toHaveValue(
    /Explain how the JavaScript event loop works/,
  );
  await cards
    .last()
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Interview answer", exact: true }),
  ).toContainText("Explain how the JavaScript event loop works");
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("accepted requests leave room for more than five questions in one session", async ({
  page,
}) => {
  test.setTimeout(60000);
  const panel = await audioFixture(page);
  const submissions: {
    interview: {
      context: { question: string; spokenAnswer: string }[];
      experience: string;
      useExperience: boolean;
    };
  }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url()))
      submissions.push(request.postDataJSON());
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Explain concept number 1?')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  for (let number = 1; number <= 6; number++) {
    await page.evaluate((number) => {
      (
        window as unknown as {
          speechTest: { transcript(source: string, text: string): void };
        }
      ).speechTest.transcript("shared", `Explain concept number ${number}?`);
    }, number);
    const card = page.getByRole("article", {
      name: "Detected question",
      exact: true,
    });
    await expect(card.getByLabel("Question to ask")).toHaveValue(
      `Explain concept number ${number}?`,
      { timeout: 12000 },
    );
    await card
      .getByRole("button", { name: "Use this question", exact: true })
      .click();
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(submissions.at(-1)?.interview).toEqual({
      experience: "",
      useExperience: false,
      context: Array.from({ length: Math.min(number - 1, 4) }, (_, index) => ({
        question: `Explain concept number ${Math.max(1, number - 4) + index}?`,
        spokenAnswer: "",
      })),
    });
    await expect(
      page.getByText(`Sent questions (${number})`, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".accepted-questions")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.getByText("Sent questions (6)", { exact: true }).click();
  await expect(page.locator(".accepted-questions li")).toHaveCount(6);
  await page.getByRole("button", { name: "New topic", exact: true }).click();
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Can you give an example?')",
  );
  const next = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(next.getByLabel("Question to ask")).toHaveValue(
    "Can you give an example?",
    { timeout: 12000 },
  );
  await next
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  expect(submissions.at(-1)?.interview.context).toEqual([]);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  await page
    .getByRole("button", { name: "New interview", exact: true })
    .click();
  await expect(page.getByText(/Sent questions \(/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New topic", exact: true }),
  ).toHaveCount(0);
});

test("typed topic reset also clears spoken context while disconnected", async ({
  page,
}) => {
  test.setTimeout(45000);
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Explain JavaScript closures?')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card).toBeVisible({ timeout: 12000 });
  await card
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await page.getByText("Ask a question", { exact: true }).click();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Explain lexical scope");
  await page.getByRole("button", { name: "Get response", exact: true }).click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/health", (route) => route.abort("failed"));
  await expect(
    page.getByText("Connection lost. Refresh history to reconnect.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 10000 });
  await page
    .getByRole("button", { name: "Start new topic", exact: true })
    .click();
  await expect(page.getByText(/Using 1 recent spoken question/)).toHaveCount(0);
  await page.unroute("**/api/health");
  await expect(page.getByText("Response ready.", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'What is the event loop?')",
  );
  await expect(card.getByLabel("Question to ask")).toHaveValue(
    "What is the event loop?",
    { timeout: 12000 },
  );
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/messages"),
  );
  await card
    .getByRole("button", { name: "Use this question", exact: true })
    .click();
  expect((await request).postDataJSON().interview.context).toEqual([]);
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
