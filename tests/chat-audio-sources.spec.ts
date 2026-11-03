import { expect, type Page } from "@playwright/test";
import { test, login } from "./auth-fixture.js";
import {
  endpoint,
  origin,
  mockNotion,
  openConnections,
  authorize,
} from "./connections-fixture.js";
import { audioFixture } from "./browser-audio-fixture.js";
import { personalPages } from "./notion-fixture.js";

async function importSource(page: Page) {
  await mockNotion(page);
  await openConnections(page);
  await authorize(page);
  const response = await page.request.post(`${endpoint}/sources`, {
    headers: { Origin: origin },
    data: { page: personalPages.migration },
  });
  expect(response.status()).toBe(201);
}

function submission(page: Page) {
  return page.waitForRequest(
    (request) =>
      request.url().endsWith("/messages") && request.method() === "POST",
  );
}

async function savedSources(page: Page, requestUrl: string) {
  const path = new URL(requestUrl).pathname.replace(/\/messages$/, "");
  const history = await (await page.request.get(path)).json();
  return history.messages.at(-1).sources;
}

test.beforeEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});
test.afterEach(async ({ page }) => {
  await page.request.delete(endpoint, { headers: { Origin: origin } });
});

test("normal chat automatically uses sources and disconnect stops new retrieval", async ({
  page,
}) => {
  await importSource(page);
  await page.goto("/");
  await login(page);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .first()
    .click();
  const toggle = page.getByRole("checkbox", {
    name: "Use my sources",
    exact: true,
  });
  await expect(toggle).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Chat sources" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill("Describe my migration rollback.");
  let request = submission(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const first = await request;
  expect(first.postDataJSON().useSources).toBe(true);
  expect(first.postDataJSON().interview).toBeUndefined();
  await expect(
    page.getByRole("button", { name: "Copy response", exact: true }),
  ).toHaveCount(1);
  expect(await savedSources(page, first.url())).toHaveLength(1);
  await page
    .getByLabel("Message", { exact: true })
    .fill("What was my migration contribution?");
  request = submission(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const second = await request;
  expect(second.postDataJSON().useSources).toBe(true);
  await expect(
    page.getByRole("button", { name: "Copy response", exact: true }),
  ).toHaveCount(2);
  const answer = page
    .getByRole("article", { name: "Panky response", exact: true })
    .last();
  await expect(answer).not.toContainText('"sources":');
  await expect(answer.locator(".source-evidence")).toHaveCount(0);
  const sources = await savedSources(page, second.url());
  expect(sources).toHaveLength(1);
  expect(sources[0].title).toBe("Owner migration");
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", { name: "View Notion connection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnect Notion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm disconnect", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Explain migration rollback in general.");
  request = submission(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const third = await request;
  await expect(
    page.getByRole("button", { name: "Copy response", exact: true }),
  ).toHaveCount(3);
  expect(await savedSources(page, third.url())).toEqual([]);
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Your message", exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByText("Retrieved evidence (1)", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/chat-sources-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/chat-sources-mobile.png" });
});

test("audio questions automatically retrieve personal sources only after explicit submission", async ({
  page,
}) => {
  await importSource(page);
  const panel = await audioFixture(page);
  await expect(
    page.getByRole("checkbox", { name: "Use my sources", exact: true }),
  ).toHaveCount(0);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      sent.push(request.url());
  });
  await page.evaluate(
    "window.speechTest.transcript('shared', 'Explain my migration rollback?')",
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
    .getByLabel("Question to ask", { exact: true })
    .fill("Describe my migration contribution and rollback.");
  const request = submission(page);
  await question
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  const first = await request;
  expect(first.postDataJSON().interview).toMatchObject({
    inputSource: "speech",
    useSources: true,
    useExperience: true,
    experience: "",
  });
  await expect(
    page.getByText("Response ready.", { exact: true }),
  ).toBeVisible();
  const answer = page.getByRole("region", {
    name: "Interview answer",
    exact: true,
  });
  await expect(answer).not.toContainText('"sources":');
  await expect(answer.locator(".source-evidence")).toHaveCount(0);
  expect(await savedSources(page, first.url())).toHaveLength(1);
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
});
