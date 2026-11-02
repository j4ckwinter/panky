# Browser audio feasibility

Open **Interview → Browser audio**, then **Start listening**. Choose the call tab, window or screen in the browser picker and enable its audio option if offered. Allow the microphone when prompted. No Mac helper, pairing code or executable path is used.

This milestone checks capture only. It shows separate shared-audio and microphone meters; it does not transcribe, record, upload or generate answers from audio. Browser-local transcription is planned in IA-4c. Existing typed interview assistance remains available.

Use headphones and play a known sound in the selected source. The shared-audio meter should move independently of your microphone. An audio track with a silent meter is not evidence that call audio is captured. A tab test proves only that tab; separately test a native call app or entire screen if those are required.

Stop or Pause releases the capture. Start again requires a new browser picker. Leaving Interview or stopping sharing through the browser also ends the session. A pending permission request can still resolve after Stop; Panky discards and stops that late stream.

## Browser requirements

Use HTTPS or localhost and a browser exposing `getDisplayMedia`, `getUserMedia`, and Web Audio. The sharing picker and permissions cannot be bypassed. Audio availability depends on the browser, operating system and selected source. If no shared-audio track is returned, Panky stops rather than pretending the microphone contains the call.

The display API requires a video track alongside shared audio. Panky does not render, inspect, record or transmit those frames; the track remains part of the browser sharing session until Stop.

Chrome's `systemAudio: "include"` is a request to offer system audio, not a guarantee. Do not infer macOS full-system support from tab sharing or API presence. See [Chrome screen-sharing controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls) and [getDisplayMedia requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

## Verification

Automated browser tests use controlled media streams to check meters, missing audio, permission failures and resource cleanup. These tests do not establish operating-system capture compatibility. Actual picker and signal results are recorded in `interview-assistant-plan.md` separately.

The Swift companion, its backend endpoints and local transcription tooling have been removed. Browser capture has no native-helper dependency.

On 2 November 2026, Chrome 156.0.8078.80 on this Mac captured a controlled WAV from a shared browser tab with a separate microphone signal. Stop cleared both meters and browser capture indicators. Entire-screen capture remains unverified because Chrome requested OS screen-recording permission and a browser restart. No captured audio was saved.
