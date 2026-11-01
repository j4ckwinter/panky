import { expect } from "@playwright/test";
import { addAuthenticator, login, test, token } from "./auth-fixture.js";

const origin = "http://localhost:5174";

test("passkey sessions survive reload, stay out of scripts, and logout revokes access", async ({
  page,
  context,
}) => {
  await page.goto("/");
  let assertion: unknown;
  page.on("request", (request) => {
    if (request.url().endsWith("/auth/login/verify"))
      assertion = request.postDataJSON();
  });
  await login(page);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "panky-session",
  );
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
  const storage = await page.evaluate(() => ({
    cookie: document.cookie,
    persistent: JSON.stringify({ ...localStorage, ...sessionStorage }),
  }));
  expect(storage.cookie).not.toContain("panky-session");
  expect(storage.persistent).not.toContain(cookie?.value);
  expect(storage.persistent).not.toContain(token);
  const replay = await context.request.post("/api/auth/login/verify", {
    headers: { Origin: origin },
    data: assertion,
  });
  expect(replay.status()).toBe(401);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Start a chat" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with passkey", exact: true }),
  ).toBeVisible();
  const denied = await context.request.get("/api/conversations", {
    headers: { Cookie: `panky-session=${cookie?.value}` },
  });
  expect(denied.status()).toBe(401);
  await login(page);
});

test("owner can revoke another device and that device returns to sign-in", async ({
  page,
  browser,
  ownerCredentials,
}) => {
  await page.goto("/");
  await login(page);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const phone = await other.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    const { cdp, authenticatorId } = await addAuthenticator(phone);
    for (const credential of ownerCredentials) {
      credential.signCount += 100;
      await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
    }
    await phone.goto("/");
    await login(phone);
    const before = await other.request.get("/api/conversations");
    expect(before.status()).toBe(200);
    await page.getByRole("button", { name: "Sessions", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Signed-in devices" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("This device", { exact: true }),
    ).toBeVisible();
    const others = await dialog
      .getByText("Other device", { exact: true })
      .count();
    await dialog
      .getByRole("button", { name: /^Sign out device from/ })
      .first()
      .click();
    await expect(dialog.getByText("Other device", { exact: true })).toHaveCount(
      others - 1,
    );
    await page.screenshot({ path: "test-results/sessions-desktop.png" });
    await phone.reload();
    await expect(
      phone.getByRole("button", { name: "Sign in with passkey", exact: true }),
    ).toBeVisible();
    expect((await other.request.get("/api/conversations")).status()).toBe(401);
    await phone.screenshot({ path: "test-results/sign-in-mobile.png" });
    await dialog
      .getByRole("button", { name: "Sign out this device", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sign in with passkey", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("recovery requires owner token and confirmation, revokes sessions and permits replacement enrollment", async ({
  page,
  context,
  browser,
}) => {
  await page.goto("/");
  await login(page);
  const original = (await context.cookies()).find(
    (item) => item.name === "panky-session",
  );
  const recoveryContext = await browser.newContext({ baseURL: origin });
  const recoverPage = await recoveryContext.newPage();
  await recoverPage.goto("/");
  await recoverPage
    .getByRole("button", { name: "Recover access", exact: true })
    .click();
  const reset = recoverPage.getByRole("button", {
    name: "Reset access",
    exact: true,
  });
  await recoverPage
    .getByRole("textbox", { name: "Recovery token", exact: true })
    .fill("incorrect-token");
  await expect(reset).toBeDisabled();
  await recoverPage.getByRole("checkbox").check();
  await reset.click();
  await expect(recoverPage.getByRole("alert")).toContainText(
    "Recovery token rejected",
  );
  await recoverPage
    .getByRole("textbox", { name: "Recovery token", exact: true })
    .fill(token);
  await reset.click();
  await expect(
    recoverPage.getByRole("heading", { name: "Set up Panky" }),
  ).toBeVisible();
  expect(
    (
      await context.request.get("/api/conversations", {
        headers: { Cookie: `panky-session=${original?.value}` },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up Panky" }),
  ).toBeVisible();
  await addAuthenticator(recoverPage);
  await recoverPage
    .getByRole("textbox", { name: "Setup token", exact: true })
    .fill(token);
  await recoverPage
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await expect(
    recoverPage.getByLabel("Message", { exact: true }),
  ).toBeEnabled();
  await recoveryContext.close();
});
