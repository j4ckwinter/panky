import { expect, test } from "@playwright/test";

for (const sampleRate of [44100, 48000]) {
  test(`PCM worklet produces separate 16 kHz chunks from ${sampleRate} Hz input and stops cleanly`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(async (rate) => {
      const modulePath = "/src/chat/interview/audio/pcmCapture.ts";
      const { attachPcmCapture } = await import(modulePath);
      const context = new AudioContext({ sampleRate: rate });
      await context.audioWorklet.addModule(
        "/src/chat/interview/audio/capture.worklet.js",
      );
      const chunks: { source: string; length: number; mean: number }[] = [];
      const errors: string[] = [];
      const cleanup: (() => void)[] = [];
      for (const [source, value] of [
        ["shared", 0.1],
        ["microphone", 0.3],
      ] as const) {
        const constant = context.createConstantSource();
        constant.offset.value = value;
        const destination = context.createMediaStreamDestination();
        constant.connect(destination);
        constant.start();
        cleanup.push(
          attachPcmCapture(
            context,
            destination.stream,
            (samples: Float32Array) => {
              chunks.push({
                source,
                length: samples.length,
                mean:
                  samples.reduce((sum, value) => sum + value, 0) /
                  samples.length,
              });
            },
            (error: string) => errors.push(error),
          ),
          () => {
            constant.stop();
            destination.stream.getTracks().forEach((track) => track.stop());
          },
        );
      }
      await context.resume();
      Object.assign(window, {
        pcmTest: {
          snapshot: () => ({ chunks, errors, rate: context.sampleRate }),
          stop: async () => {
            for (const release of cleanup) release();
            await context.close();
          },
        },
      });
    }, sampleRate);
    await expect
      .poll(() => page.evaluate("window.pcmTest.snapshot().chunks.length"), {
        timeout: 10_000,
      })
      .toBe(2);
    const result = await page.evaluate<{
      rate: number;
      errors: string[];
      chunks: { source: string; length: number; mean: number }[];
    }>("window.pcmTest.snapshot()");
    expect(result.rate).toBe(sampleRate);
    expect(result.errors).toEqual([]);
    for (const chunk of result.chunks) {
      expect(chunk.length).toBe(80_000);
      expect(chunk.mean).toBeCloseTo(chunk.source === "shared" ? 0.1 : 0.3, 2);
    }
    await page.evaluate("window.pcmTest.stop()");
    await page.waitForTimeout(300);
    expect(await page.evaluate("window.pcmTest.snapshot().chunks.length")).toBe(
      2,
    );
  });
}

test("PCM worklet fails closed when its previous chunk is not acknowledged", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const context = new AudioContext({ sampleRate: 48000 });
    await context.audioWorklet.addModule(
      "/src/chat/interview/audio/capture.worklet.js",
    );
    const source = context.createConstantSource();
    source.offset.value = 0.1;
    const processor = new AudioWorkletNode(context, "panky-pcm-capture");
    const messages: string[] = [];
    processor.port.onmessage = (event) => messages.push(event.data.type);
    source.connect(processor).connect(context.destination);
    source.start();
    await context.resume();
    Object.assign(window, {
      overflowTest: {
        messages,
        stop: async () => {
          source.stop();
          processor.port.close();
          processor.disconnect();
          await context.close();
        },
      },
    });
  });
  await expect
    .poll(() => page.evaluate("window.overflowTest.messages"), {
      timeout: 15_000,
    })
    .toEqual(["samples", "overflow"]);
  await page.evaluate("window.overflowTest.stop()");
});

test("PCM capture preserves brief pauses and emits early after sustained silence", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/src/chat/interview/audio/pcmCapture.ts";
    const { attachPcmCapture } = await import(path);
    const context = new AudioContext({ sampleRate: 48000 });
    await context.audioWorklet.addModule(
      "/src/chat/interview/audio/capture.worklet.js",
    );
    const source = context.createConstantSource();
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    const chunks: { length: number; endedAtPause: boolean }[] = [];
    const errors: string[] = [];
    const release = attachPcmCapture(
      context,
      destination.stream,
      (samples: Float32Array, endedAtPause: boolean) =>
        chunks.push({ length: samples.length, endedAtPause }),
      (error: string) => errors.push(error),
    );
    const start = context.currentTime;
    source.offset.setValueAtTime(0.1, start);
    source.offset.setValueAtTime(0, start + 1.2);
    source.offset.setValueAtTime(0.1, start + 1.5);
    source.offset.setValueAtTime(0, start + 2.7);
    source.start();
    await context.resume();
    Object.assign(window, {
      pauseTest: {
        chunks,
        errors,
        stop: async () => {
          release();
          source.stop();
          destination.stream.getTracks().forEach((track) => track.stop());
          await context.close();
        },
      },
    });
  });
  await expect
    .poll(() => page.evaluate("window.pauseTest.chunks.length"), {
      timeout: 4500,
    })
    .toBe(1);
  const result = await page.evaluate<{
    chunks: { length: number; endedAtPause: boolean }[];
    errors: string[];
  }>("({chunks:window.pauseTest.chunks, errors:window.pauseTest.errors})");
  expect(result.errors).toEqual([]);
  expect(result.chunks[0]?.endedAtPause).toBe(true);
  expect(result.chunks[0]!.length).toBeGreaterThan(50000);
  expect(result.chunks[0]!.length).toBeLessThan(57000);
  await page.evaluate("window.pauseTest.stop()");
});
