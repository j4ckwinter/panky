import { expect, type Page } from "@playwright/test";
import { login } from "./auth-fixture.js";

export const origin = "http://localhost:5174";
export const endpoint = "/api/connections/notion";

export async function mockNotion(page: Page, code = "owner", denied = false) {
  await page.route("https://api.notion.com/v1/oauth/authorize?**", (route) => {
    const authorization = new URL(route.request().url());
    const callback = new URL(
      authorization.searchParams.get("redirect_uri") ?? "",
    );
    callback.searchParams.set(
      "state",
      authorization.searchParams.get("state") ?? "",
    );
    callback.searchParams.set(
      denied ? "error" : "code",
      denied ? "access_denied" : code,
    );
    return route.fulfill({
      contentType: "text/html",
      body: `<html><body><h1>Synthetic Notion authorization</h1><a href="${callback.href.replaceAll("&", "&amp;")}">${denied ? "Deny access" : "Allow access"}</a></body></html>`,
    });
  });
}

export async function openConnections(page: Page) {
  await page.goto("/");
  await login(page);
  if ((page.viewportSize()?.width ?? 1280) <= 640)
    await page
      .getByRole("button", { name: "Conversations", exact: true })
      .click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
}

export async function authorize(page: Page, denied = false) {
  await page
    .getByRole("button", { name: /^(Connect|Reconnect) Notion$/ })
    .click();
  await page
    .getByRole("link", {
      name: denied ? "Deny access" : "Allow access",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(`${origin}/?view=connections`);
}
