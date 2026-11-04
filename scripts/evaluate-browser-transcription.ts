import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? "http://127.0.0.1:5176";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const temporary = await mkdtemp(join(tmpdir(), "panky-browser-speech-"));
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const phrase = "I led a database migration with a rollback plan.";
  execFileSync("say", [
    "-v",
    "Samantha",
    "-r",
    "145",
    "-o",
    join(temporary, "speech.aiff"),
    phrase,
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
  const wav = await readFile(join(temporary, "speech.wav"));
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript("globalThis.__name = (value) => value;");
  const writes: string[] = [];
  context.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      writes.push(request.method() + " " + request.url());
  });
  page.on("pageerror", (error) => process.stderr.write(error.message + "\n"));
  page.on("console", (message) => {
    if (message.type() === "error") process.stderr.write(message.text() + "\n");
  });
  await page.route(origin + "/speech-evaluation", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Isolated speech evaluation</title>",
    }),
  );
  await page.route(origin + "/controlled-speech.wav", (route) =>
    route.fulfill({ contentType: "audio/wav", body: wav }),
  );
  await page.goto(origin + "/speech-evaluation");
  const result = await page.evaluate(async () => {
    const modelPath = "/src/chat/interview/audio/transcription.ts";
    const capturePath = "/src/chat/interview/audio/browserAudio.ts";
    const { BrowserTranscription } = await import(modelPath);
    const { BrowserAudio } = await import(capturePath);
    const results: {
      source: string;
      text: string;
      elapsedMs: number;
      totalMs: number;
    }[] = [];
    let error = "";
    let started = 0;
    const model = new BrowserTranscription(
      (state: { status: string; error: string }) => {
        if (state.status === "error") error = state.error;
      },
      (source: string, text: string, elapsedMs: number) =>
        results.push({
          source,
          text,
          elapsedMs,
          totalMs: performance.now() - started,
        }),
      () => {},
    );
    const cold = performance.now();
    await model.load();
    if (error) throw new Error(error);
    const loadMs = performance.now() - cold;
    const audio = new AudioContext({ sampleRate: 48000 });
    const decoded = await audio.decodeAudioData(
      await (await fetch("/controlled-speech.wav")).arrayBuffer(),
    );
    const sources: AudioBufferSourceNode[] = [];
    const makeStream = () => {
      const source = audio.createBufferSource();
      source.buffer = decoded;
      const destination = audio.createMediaStreamDestination();
      source.connect(destination);
      sources.push(source);
      return destination.stream;
    };
    const canvas = document.createElement("canvas");
    const shared = makeStream();
    shared.addTrack(canvas.captureStream().getVideoTracks()[0]!);
    const microphone = makeStream();
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      value: async () => shared,
      configurable: true,
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => microphone,
      configurable: true,
    });
    const capture = new BrowserAudio(
      (state: { status: string; error: string }) => {
        if (state.status === "error") error = state.error;
      },
      (source: "shared" | "microphone", samples: Float32Array) =>
        model.submit(source, samples),
    );
    started = performance.now();
    await capture.start();
    await audio.resume();
    sources.forEach((source) => source.start());
    const deadline = performance.now() + 90_000;
    while (results.length < 2 && !error && performance.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    capture.stop();
    model.stop();
    await audio.close();
    if (error) throw new Error(error);
    if (results.length < 2)
      throw new Error("Both source transcripts did not arrive");
    const warm = performance.now();
    await model.load();
    if (error) throw new Error(error);
    const cachedLoadMs = performance.now() - warm;
    model.stop();
    const cachesBefore = await caches.keys();
    await model.clearCache();
    const cachesAfter = await caches.keys();
    model.dispose();
    return {
      loadMs,
      cachedLoadMs,
      results,
      cachesBefore,
      cachesAfter,
      tracksEnded: [...shared.getTracks(), ...microphone.getTracks()].every(
        (track) => track.readyState === "ended",
      ),
    };
  });
  assert.equal(
    writes.length,
    0,
    "Audio/model test must not send network writes",
  );
  assert(result.tracksEnded);
  assert(!result.cachesAfter.includes("panky-speech-model-v1"));
  for (const entry of result.results)
    assert.match(entry.text.toLowerCase(), /database.*migration/);
  await mkdir("test-results", { recursive: true });
  const report = {
    phrase,
    browser: browser.version(),
    ...result,
    networkWrites: writes.length,
  };
  await writeFile(
    "test-results/browser-transcription-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
