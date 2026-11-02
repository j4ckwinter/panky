import { expect, type Page } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

async function audioFixture(page: Page, mode = "success") {
  await page.addInitScript((initialMode) => {
    let mode = initialMode;
    let resolveDisplay: ((stream: MediaStream) => void) | undefined;
    let resolveMicrophone: ((stream: MediaStream) => void) | undefined;
    const tracks: MediaStreamTrack[] = [];
    let displayCalls = 0;
    let microphoneCalls = 0;
    function audio() {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.1;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      void context.resume();
      const track = destination.stream.getAudioTracks()[0]!;
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        oscillator.stop();
        void context.close().catch(() => {});
      };
      return track;
    }
    function shared() {
      const canvas = document.createElement("canvas");
      const video = canvas.captureStream(1).getVideoTracks()[0]!;
      const stream = new MediaStream([video]);
      if (mode !== "no-audio") stream.addTrack(audio());
      tracks.push(...stream.getTracks());
      return stream;
    }
    function microphone() {
      const stream = new MediaStream([audio()]);
      tracks.push(...stream.getTracks());
      return stream;
    }
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: () => {
        displayCalls++;
        if (mode === "denied")
          return Promise.reject(new DOMException("Denied", "NotAllowedError"));
        if (mode === "pending-display")
          return new Promise<MediaStream>((resolve) => {
            resolveDisplay = resolve;
          });
        return Promise.resolve(shared());
      },
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => {
        microphoneCalls++;
        if (mode === "denied-mic")
          return Promise.reject(new DOMException("Denied", "NotAllowedError"));
        if (mode === "pending-mic")
          return new Promise<MediaStream>((resolve) => {
            resolveMicrophone = resolve;
          });
        return Promise.resolve(microphone());
      },
    });
    Object.assign(window, {
      audioTest: {
        snapshot: () => ({
          displayCalls,
          microphoneCalls,
          live: tracks.filter((track) => track.readyState === "live").length,
        }),
        mode: (value: string) => {
          mode = value;
        },
        resolveDisplay: () => resolveDisplay?.(shared()),
        resolveMicrophone: () => resolveMicrophone?.(microphone()),
        end: () => {
          tracks[0]?.dispatchEvent(new Event("ended"));
        },
      },
    });
  }, mode);
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  return page.getByRole("region", { name: "Browser audio capture" });
}

async function expectReleased(page: Page) {
  await expect
    .poll(() => page.evaluate("window.audioTest.snapshot().live"))
    .toBe(0);
}

test("browser audio measures separate sources and releases them on pause, stop and navigation", async ({
  page,
}) => {
  const panel = await audioFixture(page);
  await expect(
    panel.getByRole("link", { name: "Open Mac helper" }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel).toContainText("Listening in this browser");
  await expect
    .poll(() =>
      panel
        .getByRole("meter", { name: "Shared audio level" })
        .getAttribute("value"),
    )
    .not.toBe("0");
  await expect
    .poll(() =>
      panel
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
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(panel).toContainText("Paused — audio released");
  await expectReleased(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel).toContainText("Listening in this browser");
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    2,
  );
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expectReleased(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel).toContainText("Listening in this browser");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expectReleased(page);
});

for (const mode of ["no-audio", "denied", "denied-mic"]) {
  test(`browser audio fails clearly and releases tracks for ${mode}`, async ({
    page,
  }) => {
    const panel = await audioFixture(page, mode);
    await panel.getByRole("button", { name: "Start listening" }).click();
    await expect(panel.getByRole("alert")).toContainText(
      mode === "no-audio"
        ? "No shared audio was supplied"
        : "permission was denied",
    );
    await expectReleased(page);
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
  });
}

test("browser sharing ended releases the microphone too", async ({ page }) => {
  const panel = await audioFixture(page);
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel).toContainText("Listening in this browser");
  await page.evaluate("window.audioTest.end()");
  await expectReleased(page);
  await expect(panel).toContainText("Stopped — audio released");
});

test("leaving Interview releases streams arriving from a pending picker", async ({
  page,
}) => {
  const panel = await audioFixture(page, "pending-display");
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel).toContainText("Waiting for sharing");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.evaluate("window.audioTest.resolveDisplay()");
  await expectReleased(page);
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
  await panel.getByRole("button", { name: "Start listening" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Audio sharing is unavailable here",
  );
  expect(await page.evaluate("window.audioTest.snapshot().displayCalls")).toBe(
    0,
  );
});
