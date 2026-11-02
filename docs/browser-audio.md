# Browser audio and local transcription

Open **Interview** and choose **Start listening**. Select the call tab, window or screen in the browser picker, enable its audio option, and allow your microphone. Panky prepares the local speech model automatically after capture starts, then shows source-labelled transcripts. Speech during model preparation is not transcribed.

The opening view follows New chat: one centered heading and a primary action. **Listening settings** contains optional model preloading, cache removal, audio meters and capture details. **Ask a question** opens typed questions, experience sources and conversation context. You can preload the model in settings before a call to avoid waiting during capture.

The English Whisper tiny.en model runs locally in a browser worker using WebAssembly. The first load downloads roughly 70 MB of model/runtime assets, plus application JavaScript. Model files come from Hugging Face; the application serves the bundled runtime. The dedicated browser cache retains those downloaded assets for reuse. **Remove downloaded model** in Listening settings stops the worker and deletes that cache. Ordinary browser HTTP caching may retain application assets until the browser clears them.

Audio stays in the browser. Unsent transcripts are not uploaded to Hugging Face or the Panky backend. Choosing **Use this question** sends the edited question text to the authenticated Panky backend and its configured model; the submitted question and reply are saved in chat history. Transcripts appear as separate **Shared audio** and **Microphone** segments; these identify input streams, not individual speakers. Up to 50 segments of at most 4,000 characters stay in this view. **Clear transcript** removes them; leaving Interview also clears them. Shared-audio questions produce editable cards; **Use this question** or Ctrl/Cmd+Enter explicitly requests an answer without personal experience. Microphone transcripts are excluded. Detection is a bounded English heuristic and may miss or split questions; **Use as question** on a shared segment provides a fallback. No answer is requested automatically. Typed interview assistance remains available.

Use headphones and play a known sound in the selected source. The shared-audio meter should move independently of the microphone. A silent meter is not evidence that call audio is captured. A tab test proves only that tab; separately test a native call app or entire screen if those are required.

## Stop, buffering and limitations

Pause, Stop, navigation and browser share termination release both streams, terminate the speech worker and discard pending audio/results. Text already displayed remains until cleared or you leave Interview. Starting again reloads the cached model automatically; optional preloading remains in Listening settings. Each fresh Start requires a new browser picker. If a permission prompt remains open after Stop, dismiss it; any late stream is discarded.

Separate AudioWorklets convert each input to 16 kHz mono five-second chunks. Each worklet allows at most one undelivered chunk. Inference runs serially with at most two waiting chunks plus one active chunk; overload stops capture rather than growing an audio backlog. Model loading times out after 120 seconds, each inference after 60 seconds. Quiet chunks below RMS 0.001 are skipped, so quiet speech can be missed. Stop discards partial chunks. Five-second boundaries can split words and context; the small English model can mishear technical terms and invent text. Check every transcript before using it.

Raw audio is held only in bounded memory buffers; it is not recorded to disk or played back. The display API requires a video track, but Panky does not render, inspect, record or transmit its frames. Local models still use CPU and memory. Measured sustained memory use, human speech accuracy, overlapping speakers and chunk-boundary quality remain acceptance work.

## Browser requirements

Use HTTPS or localhost with `getDisplayMedia`, `getUserMedia`, AudioWorklet, Worker and WebAssembly support. Browser pickers and permissions cannot be bypassed. Audio availability depends on browser, operating system and source. If no shared-audio track is returned, Panky stops instead of silently using the microphone alone.

Chrome's `systemAudio: "include"` requests that the browser offer system audio; it does not guarantee availability. See [Chrome screen-sharing controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls) and [getDisplayMedia requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

On 2 November 2026, Chrome 156.0.8078.80 on this Mac captured a controlled WAV from a shared browser tab with a separate microphone signal. Stop cleared both meters and capture indicators. Entire-screen capture remains unverified because Chrome requested OS screen-recording permission and a browser restart. The Swift companion and its integration have been removed.

## Verification

```sh
pnpm check
pnpm build
pnpm test:e2e
pnpm test:speech
```

`test:speech` is an opt-in production-build test that downloads the real model into an isolated browser context. On macOS it uses `say` and `afconvert` to generate temporary synthetic speech, passes controlled streams through production capture and the real speech worker, checks both labelled transcripts, an editable question, explicit submission to the isolated test provider, and resource/cache cleanup, then deletes the generated files. It does not record a microphone or use the live database.

For timing and no-network-write evidence, start a Vite development server on loopback port 5176, then run:

```sh
pnpm exec tsx scripts/evaluate-browser-transcription.ts http://127.0.0.1:5176
```

The evaluator runs controlled audio through the real capture/worklet/worker path, measures cold/cached load and source processing times, checks no network writes, and removes the dedicated model cache. Its report is saved under ignored `test-results/`. Synthetic tests establish integration, not human-interview quality.

Pinned dependencies: Transformers.js 4.3.2 and ONNX Runtime Web 1.31.0-dev.20260914-8d85527a0, matching that Transformers release. Model: `Xenova/whisper-tiny.en` revision `79fb389fc764e7c395bd330e9531d9d32ada7049`, q8 encoder and decoder. See [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) and the [model repository](https://huggingface.co/Xenova/whisper-tiny.en/tree/79fb389fc764e7c395bd330e9531d9d32ada7049).
