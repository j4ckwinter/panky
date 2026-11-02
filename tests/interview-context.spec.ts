import {
  toggleTypedQuestion,
  openInterviewOptions,
} from "./interview-options.js";
import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

test("follow-ups carry questions and spoken notes, never generated suggestions", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await toggleTypedQuestion(page);
  const field = page.getByLabel("Interview question", { exact: true });
  const submit = async (question: string) => {
    await openInterviewOptions(page);
    await field.fill(question);
    const request = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().endsWith("/messages"),
    );
    await page.getByRole("button", { name: "Get response" }).click();
    const body = (await request).postDataJSON();
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
    return body;
  };
  expect(
    (await submit("How would you design a reliable queue?")).interview.context,
  ).toEqual([]);
  await openInterviewOptions(page);
  await page
    .getByLabel("What I actually said", { exact: true })
    .fill("I proposed idempotent consumers and bounded retries.");
  const next = await submit("What if that fails?");
  expect(next.interview.context).toEqual([
    {
      question: "How would you design a reliable queue?",
      spokenAnswer: "I proposed idempotent consumers and bounded retries.",
    },
  ]);
  expect(JSON.stringify(next.interview.context)).not.toContain(
    "Immediate cues",
  );
  await expect(
    page.getByLabel("What I actually said", { exact: true }),
  ).toHaveValue("");
  await openInterviewOptions(page);
  await page.getByText("Recent questions (2)", { exact: true }).click();
  await expect(page.locator(".interview-context")).toContainText(
    "You said: I proposed idempotent consumers and bounded retries.",
  );
  await page.screenshot({
    path: "test-results/interview-context-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/interview-context-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Start new topic", exact: true })
    .click();
  await expect(
    page.getByLabel("What I actually said", { exact: true }),
  ).toHaveCount(0);
  expect((await submit("Explain database indexes.")).interview.context).toEqual(
    [],
  );
  await openInterviewOptions(page);
  await page
    .getByRole("button", { name: "New interview", exact: true })
    .click();
  await expect(
    page.getByText("No previous questions in context.", { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue("");
});

test("rejected follow-up keeps the spoken summary and draft without retrying", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await toggleTypedQuestion(page);
  const field = page.getByLabel("Interview question", { exact: true });
  await openInterviewOptions(page);
  await field.fill("Explain database indexes.");
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await openInterviewOptions(page);
  await page
    .getByLabel("What I actually said", { exact: true })
    .fill("I described a B-tree.");
  let submissions = 0;
  await page.route("**/api/conversations/*/messages", async (route) => {
    submissions++;
    expect(route.request().postDataJSON().interview.context).toEqual([
      {
        question: "Explain database indexes.",
        spokenAnswer: "I described a B-tree.",
      },
    ]);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Model unavailable" }),
    });
  });
  await openInterviewOptions(page);
  await field.fill("Why that structure?");
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(page.getByRole("alert")).toContainText("Model unavailable");
  await expect(field).toHaveValue("Why that structure?");
  await expect(
    page.getByLabel("What I actually said", { exact: true }),
  ).toHaveValue("I described a B-tree.");
  await openInterviewOptions(page);
  await expect(
    page.getByText("Recent questions (1)", { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
});

test("interview context keeps only four recent questions and clears when leaving", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await toggleTypedQuestion(page);
  const field = page.getByLabel("Interview question", { exact: true });
  for (let index = 1; index <= 6; index++) {
    await openInterviewOptions(page);
    await field.fill(`Explain queue design choice ${index}.`);
    const request = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().endsWith("/messages"),
    );
    await page.getByRole("button", { name: "Get response" }).click();
    const context = (await request).postDataJSON().interview.context;
    expect(context).toHaveLength(Math.min(index - 1, 4));
    if (index === 6)
      expect(
        context.map((turn: { question: string }) => turn.question),
      ).toEqual([
        "Explain queue design choice 2.",
        "Explain queue design choice 3.",
        "Explain queue design choice 4.",
        "Explain queue design choice 5.",
      ]);
    await expect(
      page.getByText("Response ready.", { exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await toggleTypedQuestion(page);
  await expect(
    page.getByText("No previous questions in context.", { exact: true }),
  ).toBeVisible();
});

test("accepted question remains in context when the trailing history refresh fails", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await toggleTypedQuestion(page);
  const field = page.getByLabel("Interview question", { exact: true });
  await openInterviewOptions(page);
  await field.fill("Explain database indexes.");
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  await openInterviewOptions(page);
  await page
    .getByLabel("What I actually said", { exact: true })
    .fill("I described a B-tree.");
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "History refresh unavailable" }),
      });
    } else await route.continue();
  });
  await openInterviewOptions(page);
  await field.fill("Why that structure?");
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "History refresh unavailable",
  );
  await openInterviewOptions(page);
  await expect(
    page.getByText("Recent questions (2)", { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(
    page.getByLabel("What I actually said", { exact: true }),
  ).toHaveValue("");
  await openInterviewOptions(page);
  await page
    .getByLabel("What I actually said", { exact: true })
    .fill("I explained logarithmic lookups.");
  await page.unroute("**/api/conversations");
  await openInterviewOptions(page);
  await field.fill("What if that fails?");
  const request = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Get response" }).click();
  expect((await request).postDataJSON().interview.context).toEqual([
    {
      question: "Explain database indexes.",
      spokenAnswer: "I described a B-tree.",
    },
    {
      question: "Why that structure?",
      spokenAnswer: "I explained logarithmic lookups.",
    },
  ]);
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
});

test("accepted question remains in context after an interrupted response stream", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await toggleTypedQuestion(page);
  await page.route("**/api/conversations/*/messages", async (route) => {
    const response = await route.fetch();
    const stream = await response.text();
    const start = stream
      .split("\n\n")
      .find(
        (frame) =>
          frame.startsWith("data:") &&
          JSON.parse(frame.slice(5)).type === "start",
      );
    expect(start).toBeDefined();
    await route.fulfill({ response, body: `${start}\n\n` });
  });
  const field = page.getByLabel("Interview question", { exact: true });
  await openInterviewOptions(page);
  await field.fill("Explain database indexes.");
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The reply was interrupted",
  );
  await openInterviewOptions(page);
  await expect(
    page.getByText("Recent questions (1)", { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue("");
  await openInterviewOptions(page);
  await page
    .getByLabel("What I actually said", { exact: true })
    .fill("I described a B-tree.");
  await page.unroute("**/api/conversations/*/messages");
  await openInterviewOptions(page);
  await field.fill("Why that structure?");
  const request = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Get response" }).click();
  expect((await request).postDataJSON().interview.context).toEqual([
    {
      question: "Explain database indexes.",
      spokenAnswer: "I described a B-tree.",
    },
  ]);
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
});
