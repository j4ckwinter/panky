import { expect, type Request } from "@playwright/test";
import { test } from "./auth-fixture.js";
import { audioFixture, submitAudioQuestion } from "./browser-audio-fixture.js";

test("clarification of the second spoken question is accepted", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.getByRole("button", { name: "Answer model", exact: true }).click();
  await page
    .getByRole("radio", { name: "Synthetic ChatGPT", exact: true })
    .check();
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await submitAudioQuestion(page, "What is a JavaScript closure?");
  await expect(answer).toContainText("Subscription response:");
  await submitAudioQuestion(page, "What is a direct agreement?");
  await expect(answer).toContainText("Do you mean a direct agreement");
  const reply = page.getByLabel("Reply or clarify", { exact: true });
  await reply.fill("legal");
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().interview.context).toEqual([
    { question: "What is a JavaScript closure?", spokenAnswer: "" },
    {
      question: "What is a direct agreement?",
      spokenAnswer: "",
      assistantResponse:
        "Do you mean a direct agreement in project finance, or another context?",
    },
  ]);
  await expect(answer).toContainText(
    'Subscription response: {"question":"legal"',
  );
  await expect(reply).toHaveValue("");
  await expect(page.getByText("Could not complete request")).toBeHidden();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});

for (const width of [1280, 390]) {
  test(`Interview clarification keeps its context and listening at ${width}px`, async ({
    page,
  }) => {
    const panel = await audioFixture(page);
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByRole("button", { name: "Answer model", exact: true })
      .click();
    await page
      .getByRole("radio", { name: "Synthetic ChatGPT", exact: true })
      .check();
    const requests: Request[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/messages"))
        requests.push(request);
    });
    await submitAudioQuestion(page, "What is a direct agreement?");
    const answer = page.getByRole("region", {
      name: "Interview answer",
      exact: true,
    });
    await expect(answer).toContainText(
      "Do you mean a direct agreement in project finance",
    );
    const reply = page.getByLabel("Reply or clarify", { exact: true });
    await expect(reply).toBeVisible();
    await reply.fill("Yes, project finance.");
    const composer = page.locator("form").filter({ has: reply });
    expect((await reply.boundingBox())!.height).toBeLessThanOrEqual(40);
    expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(requests).toHaveLength(1);
    const toolbar = await page.locator(".listening-welcome").boundingBox();
    const workspace = await page.locator(".interview-workspace").boundingBox();
    expect(Math.abs(toolbar!.x - workspace!.x)).toBeLessThan(2);
    expect(Math.abs(toolbar!.width - workspace!.width)).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/interview-clarification-${width}.png`,
    });
    await reply.press("Enter");
    await expect(answer).toContainText("Subscription response:");
    await expect(reply).toHaveValue("");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.postDataJSON()).toMatchObject({
      content: "Yes, project finance.",
      modelSelection: { provider: "chatgpt", model: "synthetic-chatgpt" },
      interview: {
        inputSource: "typed",
        useSources: true,
        context: [
          {
            question: "What is a direct agreement?",
            spokenAnswer: "",
            assistantResponse:
              "Do you mean a direct agreement in project finance, or another context?",
          },
        ],
      },
    });
    await expect(
      panel.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await reply.fill("Correction: I meant a director agreement.");
    await page.route("**/messages", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporarily unavailable" }),
      }),
    );
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(
      page.getByText(
        "Reply not confirmed. Check the conversation before sending again.",
      ),
    ).toBeVisible();
    await expect(reply).toHaveValue(
      "Correction: I meant a director agreement.",
    );
    expect(requests).toHaveLength(3);
    await page.unroute("**/messages");
    await page
      .getByRole("button", { name: "Review reply", exact: true })
      .click();
    expect(requests).toHaveLength(3);
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(reply).toHaveValue("");
    expect(requests).toHaveLength(4);
    expect(requests[3]!.postDataJSON().content).toBe(
      "Correction: I meant a director agreement.",
    );
    expect(
      requests[3]!
        .postDataJSON()
        .interview.context.map((turn: { question: string }) => turn.question),
    ).toEqual(["What is a direct agreement?", "Yes, project finance."]);
    await expect(
      panel.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Stop", exact: true }).click();
  });
}

test("saved answers recover reply drafts after another spoken question", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.getByRole("button", { name: "Answer model", exact: true }).click();
  await page
    .getByRole("radio", { name: "Synthetic ChatGPT", exact: true })
    .check();
  await submitAudioQuestion(page, "What is a direct agreement?");
  const reply = page.getByLabel("Reply or clarify", { exact: true });
  await expect(reply).toBeVisible();
  await reply.fill("Yes, project finance.");
  await submitAudioQuestion(page, "What is a JavaScript closure?");
  await expect(reply).toBeVisible();
  await expect(reply).toHaveValue("");
  await page.getByText("Sent questions (2)", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "View answer: What is a direct agreement?",
      exact: true,
    })
    .click();
  await expect(reply).toHaveValue("Yes, project finance.");
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  const data = (await request).postDataJSON();
  expect(data.content).toBe("Yes, project finance.");
  expect(
    data.interview.context.map((turn: { question: string }) => turn.question),
  ).toEqual(["What is a direct agreement?"]);
  await expect(reply).toHaveValue("");
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
