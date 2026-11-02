import {
  openInterviewOptions,
  closeInterviewOptions,
} from "./interview-options.js";
import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";
import { audioFixture, expectReleased } from "./browser-audio-fixture.js";

test("browser audio measures separate sources and releases them on pause, stop and navigation", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await expect(
    panel.getByRole("link", { name: "Open Mac helper" }),
  ).toHaveCount(0);
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await openInterviewOptions(page);
  await page.getByText("Listening settings", { exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole("meter", { name: "Shared audio level" })
        .getAttribute("value"),
    )
    .not.toBe("0");
  await expect
    .poll(() =>
      page
        .getByRole("meter", { name: "Microphone level" })
        .getAttribute("value"),
    )
    .not.toBe("0");
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("");
  await panel.screenshot({ path: "test-results/browser-audio-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({ path: "test-results/browser-audio-mobile.png" });
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(panel).toContainText("Paused — audio released");
  await expectReleased(page);
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    2,
  );
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expectReleased(page);
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel("New conversation", { exact: true }).click();
  await expectReleased(page);
});

for (const mode of ["no-audio", "denied", "denied-mic"]) {
  test(`browser audio fails clearly and releases tracks for ${mode}`, async ({
    page,
  }) => {
    const panel = await audioFixture(page, mode);
    await closeInterviewOptions(page);
    await panel.getByRole("button", { name: "Start listening" }).click();
    await expect(panel.getByRole("alert")).toContainText(
      mode === "no-audio"
        ? "No shared audio was supplied"
        : "permission was denied",
    );
    await expectReleased(page);
    expect(await page.evaluate("window.speechTest.loads()")).toBe(0);
    expect(
      await page.evaluate("window.audioTest.snapshot().displayCalls"),
    ).toBe(1);
    if (mode === "no-audio")
      expect(
        await page.evaluate("window.audioTest.snapshot().microphoneCalls"),
      ).toBe(0);
  });
}

for (const mode of ["pending-display", "pending-mic"]) {
  test(`Stop rejects late permissions for ${mode}`, async ({ page }) => {
    const panel = await audioFixture(page, mode);
    await closeInterviewOptions(page);
    await panel.getByRole("button", { name: "Start listening" }).click();
    await expect(panel).toContainText("Waiting for sharing");
    if (mode === "pending-mic")
      await expect
        .poll(() =>
          page.evaluate("window.audioTest.snapshot().microphoneCalls"),
        )
        .toBe(1);
    await panel.getByRole("button", { name: "Stop", exact: true }).click();
    await page.evaluate(
      mode === "pending-display"
        ? "window.audioTest.resolveDisplay()"
        : "window.audioTest.resolveMicrophone()",
    );
    await expectReleased(page);
    await expect(panel).toContainText("Stopped — audio released");
    expect(await page.evaluate("window.speechTest.loads()")).toBe(0);
  });
}

test("browser sharing ended releases the microphone too", async ({ page }) => {
  const panel = await audioFixture(page);
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await page.evaluate("window.audioTest.end()");
  await expectReleased(page);
  await expect(panel).toContainText("Stopped — audio released");
});

test("leaving Interview releases streams arriving from a pending picker", async ({
  page,
}) => {
  const panel = await audioFixture(page, "pending-display");
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel).toContainText("Waiting for sharing");
  await page.getByLabel("New conversation", { exact: true }).click();
  await page.evaluate("window.audioTest.resolveDisplay()");
  await expectReleased(page);
  expect(await page.evaluate("window.speechTest.loads()")).toBe(0);
  expect(
    await page.evaluate("window.audioTest.snapshot().microphoneCalls"),
  ).toBe(0);
});

test("unsupported browser reports capture unavailable without opening a picker", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      value: undefined,
    }),
  );
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Audio sharing is unavailable here",
  );
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    0,
  );
});

test("local speech shows separate transcripts, clears text and removes only its model cache", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await page.evaluate(async () => {
    await caches.open("panky-speech-model-v1");
    await caches.open("unrelated-cache");
  });
  await openInterviewOptions(page);
  await page.getByText("Listening settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Load speech model", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Local speech model" }),
  ).toContainText("Speech model ready");
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await panel.locator(".transcript-details > summary").click();
  const transcript = panel.getByRole("region", { name: "Live transcript" });
  await expect(transcript).toContainText("shared controlled transcript", {
    timeout: 15000,
  });
  await expect(transcript).toContainText("microphone controlled transcript");
  await expect(
    page.getByLabel("Interview question", { exact: true }),
  ).toHaveValue("");
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expectReleased(page);
  expect(await page.evaluate("window.speechTest.terminated()")).toBe(true);
  await page.evaluate("window.speechTest.late()");
  await expect(transcript).not.toContainText("late forbidden result");
  await panel.getByRole("button", { name: "Clear transcript" }).click();
  await expect(transcript.locator("article")).toHaveCount(0);
  await openInterviewOptions(page);
  await page.getByRole("button", { name: "Remove downloaded model" }).click();
  await expect(page.locator(".interview-options")).toContainText(
    "Downloaded speech model removed",
  );
  expect(await page.evaluate(() => caches.keys())).toEqual(["unrelated-cache"]);
});

test("speech download failure is explicit and does not start capture", async ({
  page,
}) => {
  const panel = await audioFixture(page, "success", "load-error");
  await openInterviewOptions(page);
  await page.getByText("Listening settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Load speech model", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Controlled model download failure",
  );
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    0,
  );
  expect(await page.evaluate("window.speechTest.terminated()")).toBe(true);
});

test("slow transcription stops capture when bounded queue fills", async ({
  page,
}) => {
  const panel = await audioFixture(page, "success", "hold");
  await openInterviewOptions(page);
  await page.getByText("Listening settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Load speech model", exact: true })
    .click();
  await expect(page.locator(".interview-options")).toContainText(
    "Speech model ready",
  );
  await closeInterviewOptions(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel.getByRole("alert")).toContainText("cannot keep up", {
    timeout: 20000,
  });
  await expectReleased(page);
  expect(await page.evaluate("window.speechTest.terminated()")).toBe(true);
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Interview starts with a focused listening action at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await login(page);
    const chatStyle = await page
      .getByRole("heading", { name: "Start a chat", exact: true })
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
        };
      });
    await page.screenshot({
      path: `test-results/chat-empty-reference-${viewport.width}.png`,
    });
    const chatHeading = await page
      .getByRole("heading", { name: "Start a chat", exact: true })
      .boundingBox();
    if (viewport.width < 640)
      await page
        .getByRole("button", { name: "Conversations", exact: true })
        .click();
    await page.getByRole("button", { name: "Interview", exact: true }).click();
    const heading = page.getByRole("heading", {
      name: "Start listening",
      exact: true,
    });
    await expect(heading).toBeVisible();
    expect(
      await heading.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
        };
      }),
    ).toEqual(chatStyle);
    await expect(page.locator(".listening-welcome p")).toHaveCount(0);
    const listeningHeading = await heading.boundingBox();
    expect(chatHeading).not.toBeNull();
    expect(listeningHeading).not.toBeNull();
    expect(Math.abs(listeningHeading!.y - chatHeading!.y)).toBeLessThan(150);
    await expect(
      page.getByRole("button", { name: "Start listening", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Load speech model", exact: true }),
    ).toBeHidden();
    await expect(
      page.getByLabel("Interview question", { exact: true }),
    ).toBeHidden();
    await expect(
      page.getByText("Conversation context", { exact: true }),
    ).toBeHidden();
    await expect(
      page.getByText("Ask a question", { exact: true }),
    ).toBeHidden();
    await expect(
      page.getByText("Listening settings", { exact: true }),
    ).toBeHidden();
    await expect(
      page
        .locator(".chat-header")
        .getByRole("button", { name: "Interview options", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/listening-empty-${viewport.width}.png`,
    });
  });
}

test("Start listening loads speech automatically and Stop cancels a pending model load", async ({
  page,
}) => {
  const panel = await audioFixture(page, "success", "pending-load");
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.speechTest.loads()")).toBe(1);
  await expect(
    panel.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Load speech model", exact: true }),
  ).toBeHidden();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expectReleased(page);
  expect(await page.evaluate("window.speechTest.terminated()")).toBe(true);
  await page.evaluate("window.speechTest.ready()");
  await expect(panel).toContainText("Stopped — audio released");
  expect(await page.evaluate("window.speechTest.loads()")).toBe(1);
});

test("source status distinguishes microphone-only activity, shared audio and silence", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  const status = panel.getByRole("status", { name: "Audio source status" });
  await expect(status).toContainText("Shared audio detected");
  await page.evaluate("window.audioTest.levels(0, 0.1)");
  await expect(status).toContainText("Only microphone audio detected", {
    timeout: 10000,
  });
  await expect(status).toContainText("Share tab audio");
  await expect(
    panel.getByText("Listening in this browser", { exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByText("Questions will appear here.", { exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".listening-welcome")
    .screenshot({ path: "test-results/listening-toolbar-warning.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".listening-welcome")
    .screenshot({ path: "test-results/listening-toolbar-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate("window.audioTest.levels(0.1, 0)");
  await expect(status).toContainText("Shared audio detected");
  await page.evaluate("window.audioTest.levels(0, 0)");
  await expect(status).toContainText("Waiting for shared audio", {
    timeout: 10000,
  });
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(status).toHaveCount(0);
});

test("Interview options preserve capture and return focus when closed", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await panel
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(
    "window.audioTest.snapshot().displayCalls",
  );
  await openInterviewOptions(page);
  await page.getByText("Listening settings", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Local speech model" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const trigger = page.getByRole("button", {
    name: "Interview options",
    exact: true,
  });
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(
    panel.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    before,
  );
  await openInterviewOptions(page);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expectReleased(page);
});
