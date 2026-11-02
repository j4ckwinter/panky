import type { Page } from "@playwright/test";

export async function openInterviewOptions(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Interview options",
    exact: true,
  });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
}

export async function closeInterviewOptions(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Interview options",
    exact: true,
  });
  if ((await trigger.getAttribute("aria-expanded")) === "true")
    await trigger.click();
}

export async function toggleTypedQuestion(page: Page) {
  await openInterviewOptions(page);
  await page.getByText("Ask a question", { exact: true }).click();
  if ((await page.locator(".interview-tools").getAttribute("open")) === null)
    await closeInterviewOptions(page);
}
