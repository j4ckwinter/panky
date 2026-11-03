import { expect } from "@playwright/test";
import { test } from "./auth-fixture.js";
import {
  endpoint,
  openConnectionsCatalogue,
  origin,
} from "./connections-fixture.js";

for (const width of [1280, 390]) {
  test(`Connections catalogue and sidebar open Notion details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    let authorizations = 0;
    page.on("request", (request) => {
      if (request.url().endsWith(`${endpoint}/authorize`)) authorizations++;
    });
    await openConnectionsCatalogue(page);
    const tile = page.getByRole("button", {
      name: "View Notion connection",
      exact: true,
    });
    await expect(tile).toBeVisible();
    await expect(page).toHaveURL(`${origin}/?view=connections`);
    await expect(page.getByLabel("Search chats", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "New conversation", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Conversation history" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `test-results/connections-catalogue-${width}.png`,
      fullPage: true,
    });
    await tile.focus();
    await page.keyboard.press("Enter");
    const back = page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Connections", exact: true });
    await expect(back).toBeVisible();
    await expect(back).toBeFocused();
    await expect(page).toHaveURL(
      `${origin}/?view=connections&connection=notion`,
    );
    await expect(tile).toHaveCount(0);
    await page.reload();
    await expect(back).toBeVisible();
    await page.screenshot({
      path: `test-results/connections-detail-${width}.png`,
      fullPage: true,
    });
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(tile).toBeVisible();
    await expect(page).toHaveURL(`${origin}/?view=connections`);
    if (width <= 640)
      await page
        .getByRole("button", { name: "Connections navigation", exact: true })
        .click();
    const available = page.getByRole("navigation", {
      name: "Available connections",
    });
    const notion = available.getByRole("button", {
      name: "Notion",
      exact: true,
    });
    await expect(available.getByRole("button")).toHaveCount(2);
    const search = page.getByRole("textbox", {
      name: "Search connections",
      exact: true,
    });
    await expect(search).toBeVisible();
    await search.fill("unknown");
    await expect(notion).toHaveCount(0);
    await search.fill("not");
    await expect(notion).toBeVisible();
    await search.fill("");
    await expect(
      page.getByText("Available connections", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Back to interview", exact: true }),
    ).toHaveCount(0);
    await notion.focus();
    await page.keyboard.press("Enter");
    await expect(back).toBeVisible();
    if (width <= 640)
      await page
        .getByRole("button", { name: "Connections navigation", exact: true })
        .click();
    await expect(notion).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Chats", exact: true }).click();
    if (width <= 640)
      await page
        .getByRole("button", { name: "Conversations", exact: true })
        .click();
    await expect(
      page.getByRole("navigation", { name: "Conversation history" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Search chats", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New conversation", exact: true }),
    ).toBeVisible();
    expect(authorizations).toBe(0);
  });
}
