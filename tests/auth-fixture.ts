import {
  expect,
  type BrowserContext,
  type Page,
  test as base,
} from "@playwright/test";

export const token = "panky-browser-test-token-never-use-in-production";
export const ownerEmail = "owner@gmail.com";
export async function mockGoogle(context: BrowserContext, email = ownerEmail) {
  await context.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `(() => {
      let config;
      window.google = { accounts: { id: {
        initialize(options) { config = options; },
        renderButton(container) {
          const button = document.createElement('button');
          button.textContent = 'Sign in with Google';
          button.type = 'button';
          button.onclick = () => config.callback({credential: JSON.stringify({
            sub: ${JSON.stringify("google-" + email)}, email: ${JSON.stringify(email)}, email_verified: true, nonce: config.nonce
          })});
          container.replaceChildren(button);
        },
        disableAutoSelect() {},
        cancel() {}
      }}};
    })();`,
    }),
  );
}

type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
export const test = base.extend<
  Record<never, never>,
  { ownerCookies: Cookies }
>({
  ownerCookies: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        baseURL: "http://localhost:5174",
      });
      await mockGoogle(context);
      const page = await context.newPage();
      await page.goto("/");
      await login(page);
      const cookies = await context.cookies();
      await context.close();
      await use(cookies);
    },
    { scope: "worker" },
  ],
  page: async ({ page, ownerCookies }, use, testInfo) => {
    await mockGoogle(page.context());
    if (
      !testInfo.file.endsWith("zz-auth.spec.ts") &&
      !testInfo.title.startsWith("connection page")
    )
      await page.context().addCookies(ownerCookies);
    await use(page);
  },
});

export async function login(page: Page) {
  const composer = page.getByLabel("Message", { exact: true });
  const button = page.getByRole("button", {
    name: "Sign in with Google",
    exact: true,
  });
  await expect(composer.or(button)).toBeVisible();
  if (await button.isVisible()) await button.click();
  await expect(composer).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Refresh history",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
}
