import { expect } from "@playwright/test";
import { historySchema } from "@panky/shared";
import { test, login, token } from "./auth-fixture.js";

test("Interview navigation stays in the sidebar on desktop, collapsed and mobile layouts", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  const navigation = page.getByRole("navigation", { name: "Panky features" });
  const interview = navigation.getByRole("button", {
    name: "Interview",
    exact: true,
  });
  await interview.click();
  await page.getByText("Ask a question", { exact: true }).click();
  await expect(interview).toHaveAttribute("aria-current", "page");
  await expect(
    page
      .locator(".chat-header")
      .getByRole("button", { name: "Interview", exact: true }),
  ).toHaveCount(0);
  const question = page.getByLabel("Interview question", { exact: true });
  await question.fill("Keep this draft when clicking the selected item");
  await interview.click();
  await expect(question).toHaveValue(
    "Keep this draft when clicking the selected item",
  );
  await page.screenshot({
    path: "test-results/interview-sidebar-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(interview).toBeVisible();
  await expect(interview).toHaveAttribute("aria-current", "page");
  await interview.click();
  await expect(question).toHaveValue(
    "Keep this draft when clicking the selected item",
  );
  await page.screenshot({
    path: "test-results/interview-sidebar-collapsed.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await expect(interview).toBeVisible();
  await page.screenshot({
    path: "test-results/interview-sidebar-mobile.png",
    fullPage: true,
  });
  await interview.click();
  await expect(
    page.getByRole("dialog", { name: "Conversations", exact: true }),
  ).toHaveCount(0);
  await expect(question).toHaveValue(
    "Keep this draft when clicking the selected item",
  );
  await expect(
    page.getByRole("button", { name: "Conversations", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await expect(interview).not.toHaveAttribute("aria-current", "page");
  await interview.click();
  await page.getByText("Ask a question", { exact: true }).click();
  await expect(question).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("chat follows streamed output after leaving a populated interview panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("Interview return scroll regression");
  await page.getByRole("button", { name: "Get talking points" }).click();
  await expect(
    page.getByText("Talking points ready.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Interview return scroll regression",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "Scroll after interview\n" +
        "A line that grows the streamed answer.\n".repeat(65),
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const reply = page
    .getByRole("article", { name: "Panky response", exact: true })
    .last();
  await expect(reply).toContainText("This is a mock response");
  await page.locator(".chat-scroll").evaluate((element) => {
    element.scrollTop = 1;
  });
  await page
    .getByRole("button", { name: "Jump to latest", exact: true })
    .click();
  const resumedLength = (await reply.textContent())?.length ?? 0;
  await expect
    .poll(async () => (await reply.textContent())?.length ?? 0)
    .toBeGreaterThan(resumedLength + 300);
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled({ timeout: 20000 });
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate(
          (element) =>
            element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
    )
    .toBeLessThan(5);
});

test("interview questions stream through the backend, support editing, and retain saved answers", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Interview assistant" }),
  ).toBeVisible();
  await expect(page.getByText(/Scripted synthetic examples/)).toBeVisible();
  await page.getByText("Experience sample (optional)", { exact: true }).click();
  await page
    .getByLabel("Your experience sample", { exact: true })
    .fill(
      "Synthetic test sample: I helped choose a queue for an internal demo. No measured outcome.",
    );
  const field = page.getByLabel("Interview question", { exact: true });
  await field.fill("Tell me about a technical decision you influenced.");
  const submission = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Get talking points" }).click();
  const sent = await submission;
  expect(sent.postDataJSON().interview.experience).toContain(
    "Synthetic test sample",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Talking points ready." }),
  ).toBeVisible();
  const answer = page.getByRole("region", { name: "Interview answer" });
  await expect(
    answer.getByRole("heading", { name: "Immediate cues" }),
  ).toBeVisible();
  expect(
    await answer.locator(".interview-cues li").count(),
  ).toBeGreaterThanOrEqual(3);
  await expect(answer.locator(".interview-detail")).not.toHaveAttribute(
    "open",
    "",
  );
  await answer.getByText("Supporting detail", { exact: true }).click();
  await expect(answer.locator(".interview-detail")).toHaveAttribute("open", "");
  const historyUrl = sent.url().replace(/\/messages$/, "");
  const saved = historySchema.parse(
    await (
      await request.get(historyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  expect(saved.runs[0]?.status).toBe("completed");
  expect(saved.messages[0]?.content).toBe(
    "Tell me about a technical decision you influenced.",
  );
  expect(saved.messages[1]?.content).toContain("## Immediate cues");
  await page.screenshot({
    path: "test-results/interview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit last question" }).click();
  await expect(field).toHaveValue(
    "Tell me about a technical decision you influenced.",
  );
  await field.fill("How would you design a queue?");
  await page.getByRole("button", { name: "Get talking points" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Talking points ready." }),
  ).toBeVisible();
  await expect(answer).toContainText("How would you design a queue?");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/interview-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "New interview", exact: true })
    .click();
  await expect(answer).toHaveCount(0);
  await expect(field).toHaveValue("");
  await expect(
    page.getByLabel("Your experience sample", { exact: true }),
  ).toHaveValue("");
  await page.setViewportSize({ width: 1280, height: 720 });
  let posts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/messages")) posts++;
  });
  await page.reload();
  await login(page);
  await page
    .getByRole("button", {
      name: "Tell me about a technical decision you influenced.",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("article", { name: "Panky response", exact: true }).first(),
  ).toContainText("Immediate cues");
  expect(posts).toBe(0);
});

test("interview cancellation preserves partial output without retrying", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  await page
    .getByLabel("Interview question", { exact: true })
    .fill("How would you design a reliable service?");
  const submission = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Get talking points" }).click();
  const sent = await submission;
  await expect(
    page.getByRole("button", { name: "New interview", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Stop response", exact: true })
    .click();
  await expect(
    page.getByText("Stopped. Partial talking points are saved.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = historySchema.parse(
    await (
      await request.get(sent.url().replace(/\/messages$/, ""), {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  expect(saved.runs).toHaveLength(1);
  expect(saved.runs[0]?.status).toBe("cancelled");
  expect(saved.messages[1]?.status).toBe("interrupted");
});

test("interview reports an unavailable backend and retains the question without retry", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByText("Ask a question", { exact: true }).click();
  let submissions = 0;
  let historyUrl = "";
  await page.route("**/api/conversations/*/messages", async (route) => {
    submissions++;
    historyUrl = route
      .request()
      .url()
      .replace(/\/messages$/, "");
    await route.abort("failed");
  });
  const field = page.getByLabel("Interview question", { exact: true });
  await field.fill("Explain database indexes.");
  await page.getByRole("button", { name: "Get talking points" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not reach Panky");
  await expect(field).toHaveValue("Explain database indexes.");
  expect(submissions).toBe(1);
  expect(
    (
      await request.delete(historyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(204);
});
