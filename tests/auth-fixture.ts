import {
  expect,
  type BrowserContext,
  type Page,
  test as base,
} from "@playwright/test";

export const token = "panky-browser-test-token-never-use-in-production";
export async function addAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { cdp, authenticatorId };
}

async function enroll(page: Page) {
  const authenticator = await addAuthenticator(page);
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Setup token", exact: true })
    .fill(token);
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  const { credentials } = await authenticator.cdp.send(
    "WebAuthn.getCredentials",
    {
      authenticatorId: authenticator.authenticatorId,
    },
  );
  return credentials;
}

type Credentials = Awaited<ReturnType<typeof enroll>>;
let ownerCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
export const test = base.extend<
  Record<never, never>,
  { ownerCredentials: Credentials }
>({
  ownerCredentials: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        baseURL: "http://localhost:5174",
      });
      const page = await context.newPage();
      const reset = await context.request.post(
        "http://127.0.0.1:3101/api/auth/recover",
        {
          headers: { Origin: "http://localhost:5174" },
          data: { token },
        },
      );
      expect(reset.ok()).toBeTruthy();
      const credentials = await enroll(page);
      ownerCookies = await context.cookies();
      await context.close();
      await use(credentials);
    },
    { scope: "worker" },
  ],
  page: async ({ page, ownerCredentials }, use, testInfo) => {
    if (
      !testInfo.file.endsWith("zz-auth.spec.ts") &&
      !testInfo.title.startsWith("connection page")
    ) {
      await page.context().addCookies(ownerCookies);
    }
    const { cdp, authenticatorId } = await addAuthenticator(page);
    for (const credential of ownerCredentials) {
      credential.signCount += 100;
      await cdp.send("WebAuthn.addCredential", {
        authenticatorId,
        credential,
      });
    }
    await use(page);
  },
});

export async function login(page: Page) {
  const composer = page.getByLabel("Message", { exact: true });
  const button = page.getByRole("button", {
    name: "Sign in with passkey",
    exact: true,
  });
  await expect(composer.or(button)).toBeVisible();
  if (await button.isVisible()) await button.click();
  await expect(composer).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeEnabled();
}
