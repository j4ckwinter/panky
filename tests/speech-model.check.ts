import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { test, login } from "./auth-fixture.js";

test("production speech reaches an editable question and the answer endpoint", async ({
  page,
}) => {
  const temporary = await mkdtemp(join(tmpdir(), "panky-built-speech-"));
  try {
    execFileSync("say", [
      "-v",
      "Samantha",
      "-r",
      "145",
      "-o",
      join(temporary, "speech.aiff"),
      "What is a closure in JavaScript?",
    ]);
    execFileSync("afconvert", [
      "-f",
      "WAVE",
      "-d",
      "LEI16@16000",
      "-c",
      "1",
      join(temporary, "speech.aiff"),
      join(temporary, "speech.wav"),
    ]);
    const bytes = [...(await readFile(join(temporary, "speech.wav")))];
    await page.addInitScript((bytes) => {
      const tracks: MediaStreamTrack[] = [];
      async function audio() {
        const context = new AudioContext();
        const source = context.createBufferSource();
        source.buffer = await context.decodeAudioData(
          new Uint8Array(bytes).buffer,
        );
        const destination = context.createMediaStreamDestination();
        source.connect(destination);
        await context.resume();
        source.start(context.currentTime + 0.5);
        const track = destination.stream.getAudioTracks()[0]!;
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          source.stop();
          void context.close().catch(() => {});
        };
        tracks.push(track);
        return destination.stream;
      }
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: async () => {
          const stream = await audio();
          const video = document
            .createElement("canvas")
            .captureStream()
            .getVideoTracks()[0]!;
          tracks.push(video);
          stream.addTrack(video);
          return stream;
        },
      });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: audio,
      });
      Object.assign(window, {
        allSpeechTracksEnded: () =>
          tracks.every((track) => track.readyState === "ended"),
      });
    }, bytes);
    await page.goto("/");
    await login(page);
    await page.getByRole("button", { name: "Interview", exact: true }).click();
    const panel = page.getByRole("region", { name: "Browser audio capture" });
    await panel.getByText("Listening settings", { exact: true }).click();
    await panel
      .getByRole("button", { name: "Load speech model", exact: true })
      .click();
    await expect(
      panel.getByRole("region", { name: "Local speech model" }),
    ).toContainText("Speech model ready", { timeout: 90_000 });
    const captureStarted = Date.now();
    await panel.getByRole("button", { name: "Start listening" }).click();
    await panel.locator(".transcript-details > summary").click();
    const card = page.getByRole("article", {
      name: "Detected question",
      exact: true,
    });
    await expect(card).toHaveCount(1, { timeout: 25000 });
    await expect(card.getByLabel("Question to ask")).toHaveValue(/closure/i);
    console.log(
      JSON.stringify({
        captureToQuestionMs: Date.now() - captureStarted,
        question: await card.getByLabel("Question to ask").inputValue(),
      }),
    );
    const entries = panel
      .getByRole("region", { name: "Live transcript" })
      .locator("article");
    await expect(entries).toHaveCount(2, { timeout: 25000 });
    await expect(entries.filter({ hasText: "Shared audio" })).toContainText(
      /closure/i,
    );
    await expect(entries.filter({ hasText: "Microphone" })).toContainText(
      /closure/i,
    );
    await card
      .getByRole("button", { name: "Use this question", exact: true })
      .click();
    await expect(
      page.getByText("Sent questions (1)", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Interview answer", exact: true }),
    ).toContainText("Suggested approach");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    expect(await page.evaluate("window.allSpeechTracksEnded()")).toBe(true);
    await panel.screenshot({
      path: "test-results/speech-production-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({
      path: "test-results/speech-production-mobile.png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel
      .getByRole("button", { name: "Remove downloaded model" })
      .click();
    await expect(panel).toContainText("Downloaded speech model removed");
    expect(await page.evaluate(() => caches.keys())).not.toContain(
      "panky-speech-model-v1",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
