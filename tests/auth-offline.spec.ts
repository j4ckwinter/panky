import { expect, test } from "@playwright/test";
import { mockGoogle } from "./auth-fixture.js";

const offlineMessage =
  "Can’t reach Panky’s PC. It might be switched off. Try again in a bit.";

for (const failure of ["network", "tunnel", "502", "503", "504"]) {
  test(`offline sign-in shows the nap message for ${failure} and can recover`, async ({
    page,
  }) => {
    await mockGoogle(page.context());
    await page.route("**/api/auth/status", (route) =>
      failure === "network"
        ? route.abort("connectionrefused")
        : route.fulfill({
            status: failure === "tunnel" ? 404 : Number(failure),
            contentType: "text/html",
            body:
              failure === "tunnel"
                ? "<html>ERR_NGROK_3200: The endpoint is offline.</html>"
                : "<html>Service unavailable</html>",
          }),
    );
    await page.goto("/");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Panky’s having a nap");
    await expect(alert).toContainText(offlineMessage);
    if (failure === "tunnel") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "test-results/auth-offline-mobile.png" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.unroute("**/api/auth/status");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sign in with Google", exact: true }),
    ).toBeVisible();
  });
}

test("PC going offline during Google verification shows the nap message", async ({
  page,
}) => {
  await mockGoogle(page.context());
  await page.route("**/api/auth/google/verify", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("alert")).toContainText("Panky’s having a nap");
  await expect(page.getByRole("alert")).toContainText(offlineMessage);
});

for (const status of [403, 503]) {
  test(`specific server errors remain visible for ${status}`, async ({
    page,
  }) => {
    await page.route("**/api/auth/status", (route) =>
      route.fulfill({ status, json: { error: "Sign-in is unavailable." } }),
    );
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Could not sign in");
    await expect(page.getByRole("alert")).toContainText(
      "Sign-in is unavailable.",
    );
    await expect(page.getByRole("alert")).not.toContainText("nap");
  });
}
