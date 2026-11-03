import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import { audioFixture, submitAudioQuestion } from "./browser-audio-fixture.js";

test("shared speech becomes an editable general question and sends once only on acceptance", async ({
  page,
}) => {
  const panel = await audioFixture(page);
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
    .getByRole("button", { name: "Send question", exact: true })
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
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  const historyBox = await page.locator(".sent-questions").boundingBox();
  const responseBox = await answer.boundingBox();
  expect(historyBox!.y).toBeGreaterThanOrEqual(
    responseBox!.y + responseBox!.height,
  );
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
  await page.getByText("Sent questions (1)", { exact: true }).click();
  await page
    .locator(".sent-questions")
    .screenshot({ path: "test-results/sent-questions-refined.png" });
  await page.getByText("Sent questions (1)", { exact: true }).click();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    content: "Explain a JavaScript closure with a short example.",
    interview: {
      experience: "",
      inputSource: "speech",
      context: [],
      useExperience: true,
      useSources: true,
    },
  });
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
  const sendBox = await card
    .getByRole("button", { name: "Send question", exact: true })
    .boundingBox();
  const dismissBox = await card
    .getByRole("button", { name: "Dismiss question", exact: true })
    .boundingBox();
  expect(Math.abs(sendBox!.y - dismissBox!.y)).toBeLessThan(2);
  const queueBox = await cards.boundingBox();
  const answerBox = await answer.boundingBox();
  expect(queueBox!.x + queueBox!.width).toBeLessThanOrEqual(answerBox!.x);
  await page.screenshot({
    path: "test-results/interview-question-controls-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await expect(
    card.getByRole("button", { name: "Send question", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/interview-question-controls-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await cards
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toMatchObject({
    content: "How does lexical scope work?",
    interview: {
      experience: "",
      useExperience: true,
      useSources: true,
      inputSource: "speech",
      context: [
        {
          question: "Explain a JavaScript closure with a short example.",
          spokenAnswer: "",
        },
      ],
    },
  });
  expect(JSON.stringify(submissions[1])).not.toContain("Synthetic example");
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .locator(".sent-questions")
    .screenshot({ path: "test-results/spoken-question-history.png" });
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
    .getByRole("button", { name: "Send question", exact: true })
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
  await submitAudioQuestion(page, "Explain closures?");
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
    .getByRole("button", { name: "Send question", exact: true })
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
    .getByRole("button", { name: "Send question", exact: true })
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
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(submissions.at(-1)?.interview).toEqual({
      experience: "",
      useExperience: true,
      useSources: true,
      inputSource: "speech",
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
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  expect(submissions.at(-1)?.interview.context).toEqual([]);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await expect(page.getByText(/Sent questions \(/)).toHaveCount(0);
});

test("the same follow-up can be asked after context changes without replaying consecutive chunks", async ({
  page,
}) => {
  test.setTimeout(60000);
  const panel = await audioFixture(page);
  const texts = [
    "Explain closures?",
    "Can you give an example?",
    "Explain the event loop?",
    "Can you give an example?",
  ];
  await page.evaluate(
    (text) =>
      (
        window as unknown as {
          speechTest: { transcript(source: string, text: string): void };
        }
      ).speechTest.transcript("shared", text),
    texts[0]!,
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      submissions++;
  });
  for (const [index, text] of texts.entries()) {
    await page.evaluate(
      (text) =>
        (
          window as unknown as {
            speechTest: { transcript(source: string, text: string): void };
          }
        ).speechTest.transcript("shared", text),
      text,
    );
    const card = page.getByRole("article", {
      name: "Detected question",
      exact: true,
    });
    await expect(card.getByLabel("Question to ask")).toHaveValue(text, {
      timeout: 12000,
    });
    await card
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
    expect(submissions).toBe(index + 1);
    await expect(card).toHaveCount(0);
  }
  await page.waitForTimeout(5500);
  await expect(
    page.getByRole("article", { name: "Detected question", exact: true }),
  ).toHaveCount(0);
  expect(submissions).toBe(4);
  await page.getByText("Sent questions (4)", { exact: true }).click();
  const repeated = page.getByRole("button", {
    name: "View answer: Can you give an example?",
    exact: true,
  });
  await expect(repeated).toHaveCount(2);
  await repeated.first().click();
  await expect(
    page.getByRole("heading", { name: "Earlier question", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to current response", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current question", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New topic", exact: true }).click();
  await panel.locator(".transcript-details > summary").click();
  await panel
    .getByRole("region", { name: "Live transcript", exact: true })
    .locator("article")
    .filter({ hasText: "Can you give an example?" })
    .last()
    .getByRole("button", { name: "Use as question", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Detected question", exact: true })
      .getByLabel("Question to ask"),
  ).toHaveValue("Can you give an example?", { timeout: 12000 });
  expect(submissions).toBe(4);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("a sustained audio pause settles an imperative question without a question mark", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Explain the JavaScript event loop.')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await page.waitForTimeout(1500);
  await page.evaluate("window.audioTest.levels(0, 0)");
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card.getByLabel("Question to ask")).toHaveValue(
    "Explain the JavaScript event loop.",
    { timeout: 4000 },
  );
  await card
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("a pause after an incomplete phrase retains it for the next audio chunk", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'What is a closure in')",
  );
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await panel.locator(".transcript-details > summary").click();
  await page.waitForTimeout(1500);
  await page.evaluate("window.audioTest.levels(0, 0)");
  await expect(
    panel.getByRole("region", { name: "Live transcript", exact: true }),
  ).toContainText("What is a closure in", { timeout: 4000 });
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card).toHaveCount(0);
  await page.evaluate(
    "window.speechTest.transcript('shared', 'JavaScript?'); window.audioTest.levels(0.1, 0)",
  );
  await page.waitForTimeout(1500);
  await page.evaluate("window.audioTest.levels(0, 0)");
  await expect(card.getByLabel("Question to ask")).toHaveValue(
    "What is a closure in JavaScript?",
    { timeout: 4000 },
  );
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("sent questions reopen their own answers without stopping listening or replacing them with live output", async ({
  page,
}) => {
  test.setTimeout(45000);
  const panel = await audioFixture(page);
  const first = "Tell me about a difficult project?";
  await page.evaluate(
    (text) =>
      (
        window as unknown as {
          speechTest: { transcript(source: string, text: string): void };
        }
      ).speechTest.transcript("shared", text),
    first,
  );
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      submissions++;
  });
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Detected question",
    exact: true,
  });
  await expect(card.getByLabel("Question to ask")).toHaveValue(first, {
    timeout: 12000,
  });
  await card
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await page.getByText("Sent questions (1)", { exact: true }).click();
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How would you design a cache?')",
  );
  await expect(card.getByLabel("Question to ask")).toHaveValue(
    "How would you design a cache?",
    { timeout: 12000 },
  );
  await card
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop response", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `View answer: ${first}`, exact: true })
    .click();
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await expect(
    answer.getByRole("heading", { name: "Earlier question", exact: true }),
  ).toBeVisible();
  await expect(answer).toContainText("fictional engineer");
  await expect(
    page.getByText("Current response: Response ready.", { exact: true }),
  ).toBeVisible();
  await expect(answer).not.toContainText("clarify the workload");
  expect(
    await page.evaluate("window.audioTest.snapshot().live"),
  ).toBeGreaterThan(0);
  expect(submissions).toBe(2);
  await page.screenshot({ path: "test-results/interview-earlier-answer.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await answer.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/interview-earlier-answer-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("button", { name: "Back to current response", exact: true })
    .click();
  await expect(answer).toContainText("How would you design a cache?");
  await expect(answer).toContainText("clarify the workload");
  await page
    .getByRole("button", { name: `View answer: ${first}`, exact: true })
    .click();
  await page.evaluate(
    "window.speechTest.transcript('shared', 'How would you design a queue?')",
  );
  await expect(card.getByLabel("Question to ask")).toHaveValue(
    "How would you design a queue?",
    { timeout: 12000 },
  );
  await card
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    answer.getByRole("heading", { name: "Current question", exact: true }),
  ).toBeVisible();
  await expect(answer).toContainText("How would you design a queue?");
  await page
    .getByRole("button", { name: `View answer: ${first}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop response", exact: true })
    .click();
  await expect(answer).toContainText("fictional engineer");
  await page
    .getByRole("button", { name: "Back to current response", exact: true })
    .click();
  await expect(
    page.getByText("Stopped. Partial response is saved.", { exact: true }),
  ).toBeVisible();
  await expect(answer).toContainText("How would you design a queue?");
  expect(submissions).toBe(3);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

test("speech-derived questions keep their submitted text", async ({ page }) => {
  const panel = await audioFixture(page);
  const question = "What is use state in React?";
  const submissions: Array<{
    content: string;
    interview: { inputSource?: string };
  }> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url()))
      submissions.push(request.postDataJSON());
  });
  await page.evaluate((text) => {
    (
      window as unknown as {
        speechTest: { transcript(source: string, text: string): void };
      }
    ).speechTest.transcript("shared", text);
  }, question);
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const draft = page.getByLabel("Question to ask", { exact: true });
  await expect(draft).toHaveValue(question, { timeout: 15000 });
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    content: question,
    interview: { inputSource: "speech" },
  });
  await expect(page.locator(".interview-question > p").first()).toHaveText(
    question,
  );
  await page.getByText("Sent questions (1)", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: `View answer: ${question}`, exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
