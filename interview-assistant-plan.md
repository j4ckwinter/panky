# Panky Interview Assistant — Milestone Plan

Status: IA-1 through IA-3 implemented; real-model acceptance pending. Native IA-4/IA-4a experiments have been removed. Browser-only capture (IA-4b) and local transcription (IA-4c) are implemented with controlled verification; human interview acceptance remains pending. IA-5 onward have not started.

## Outcome

Build an assistant that sits beside a live interview, recognises questions from Mac call audio, and shows concise help in Panky:

- Behavioural and project questions: relevant experience, personal contributions, outcomes and links to the original Notion notes.
- Technical questions: explanations, clarifying questions, approaches, tradeoffs and failure cases.
- Mixed questions and follow-ups: technical reasoning grounded in the user's experience and the current conversation.

The interface should offer a few useful cues at a glance, with supporting detail available on demand. It must distinguish documented experience from suggested reasoning and never invent achievements or metrics.

## Relationship to the existing roadmap

This is a proposed implementation track for the “One Useful Workflow” direction in [brief.md](brief.md). Its milestones use the prefix IA to avoid conflicting with the existing project milestones. It does not schedule the broader approvals, routines or automation roadmap.

Milestone 3 remains the baseline. The user previously authorized IA-1 through IA-4 and IA-4a implementation and verification on 2 November 2026, then replaced the native direction with IA-4b and requested removal of the Swift experiment. [AGENTS.md](AGENTS.md) now permits IA-1 through IA-3, IA-4b and the subsequently authorized IA-4c while retaining the restriction on later work. IA-1 was committed as `88afede` before starting IA-2; IA-2 was committed as `bde60e6` before starting IA-3; IA-3 was committed as `2a1370d` before IA-4. The user authorized proceeding while the PC remains unavailable; outstanding real-model acceptance checks remain open. Other safeguards remain in force.

Work through one IA milestone at a time. Review its outcome and evidence before starting the next. Creating this plan does not authorize deployment, model downloads, external provisioning or subsequent implementation.

## Starting point and proposed architecture

The current [README](README.md) documents authenticated web access, per-user conversations, SQLite persistence, streamed local Ollama responses and one active response globally. The current provider consumes text. Existing small model benchmarks do not establish interview quality or end-to-end latency.

Proposed flow:

```text
Selected Notion pages → authenticated backend import → local searchable experience

Mac call audio + microphone → local transcription → authenticated Panky backend
  → question and conversation context → relevant experience → local Ollama
  → compact interview panel
```

Start with typed questions and a curated import. Add capture only after the answer panel is useful. Prefer local transcription on the Mac, subject to a measured feasibility check. Ollama stays on the Windows PC and loopback only.

Keep the React UI and authenticated API client in `apps/web`, retrieval and orchestration in separate server feature modules, and runtime API contracts in `packages/shared`. Capture and future local speech inference belong in the browser; no native companion is required.

## IA-1 — Typed interview panel and evaluation baseline

Status: implemented and locally verified, acceptance pending.

Implemented: dedicated typed panel accessed through **Interview** in the left sidebar, optional experience input, streamed cue/detail output, editing, cancellation and new interviews. The sidebar highlights the selected feature, retains an Interview icon when collapsed, and exposes the same navigation in the mobile menu. Interview requests reuse the authenticated message endpoint, persisted task lifecycle and global response slot, with tools disabled. Samples are not stored separately; generated replies may quote them. Each question is standalone and saved history opens in the normal chat view.

The [evaluation guide](docs/interview-evaluation.md) and 24-case harness separate mock transport checks from real-model quality. The user confirmed the Windows PC is unavailable during this implementation session. PC measurements with a user-selected experience sample, numerical targets agreed after the baseline run, and the user's spoken-use review are still required. No real-model acceptance is claimed.

**Outcome:** Enter a question and receive a compact, usable response in a dedicated interview view.

Scope:

- Support behavioural, technical and mixed questions without a manual mode switch.
- Show the current question, three or four immediate cues, and expandable detail.
- Allow question editing, explicit submission, cancellation and a new interview session.
- Use a small synthetic experience fixture in mock development. Clearly label fixture content; do not claim real Notion retrieval exists.
- For real-model checks, use a small user-selected experience sample supplied as context. Preserve the distinction between sourced experience and general suggestions.
- Assemble at least 20 representative questions covering behavioural stories, technical explanations, system design, mixed questions, ambiguous prompts and follow-ups.
- Define a scoring rubric for correctness, relevant experience, factual support, readability and missing-information handling.
- Measure submission-to-first-useful-cue and full-response time separately. Choose numerical latency and quality acceptance targets with the user from these results before declaring the milestone complete.

Completion checks:

- [x] The panel works through the real authenticated backend and has clear busy, interrupted and unavailable states.
- [x] Mock browser tests verify the complete interaction without live data.
- [ ] A real-model evaluation on the PC records question-level results, latency and failures against agreed targets.
- [ ] Unsupported personal claims are flagged as failures; missing experience produces an explicit gap rather than a fabricated story.
- [ ] The user reviews the panel while speaking aloud and can find the useful cues quickly.

Verification on 2 November 2026:

- `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm build` passed; the check includes 66 backend tests.
- `pnpm test:e2e` passed all 37 browser tests against an isolated in-memory backend. Interview coverage includes sidebar navigation on desktop, collapsed and mobile layouts, submission, editing, expandable detail, cancellation, saved history, failed submission without retry and returning to normal chat scrolling.
- Desktop and mobile screenshots were inspected. Generated evidence is in `test-results/interview-desktop.png`, `test-results/interview-mobile.png` and `test-results/interview-sidebar-{desktop,collapsed,mobile}.png` (overwritten by subsequent browser runs).
- Independent review found a test fixture omission and a scroll-observer lifecycle regression. Both were corrected; the scroll regression was reproduced and its fix verified. Final review had no remaining actionable findings.
- `pnpm evaluate:interview` passed its dry run with 24 cases and no model calls. The harness was also exercised against temporary local fake Ollama success and failure responses; these validate the harness, not model quality.
- The production build reports a non-blocking JavaScript chunk-size warning. No deployment, real model run, audio capture or Notion access was performed.

## IA-2 — Import and retrieve personal experience

Status: implemented and locally verified; live connection, personal-corpus and real-model acceptance pending. Depends on IA-1's implemented flow.

Implemented: owner-only server Notion connection, explicit page imports, bounded traversal with warnings, inspect/refresh/remove controls, per-user SQLite FTS5 retrieval, and persisted source snapshots displayed separately from generated text. A failed refresh retains the old timestamp and inspectable copy but excludes that source from new answers. Re-import and removal are transactional. See [setup, limits and verification](docs/notion-experience.md).

**Outcome:** Answers use relevant, inspectable evidence from selected Notion pages.

Scope:

- Add read-only import of explicitly selected pages and supported child content, with credentials kept on the backend.
- Define supported block types and report skipped, inaccessible or partially imported content.
- Retain source page IDs, links and import timestamps. Bound page traversal, content size and request duration.
- Store imported material per user, with an inspectable source list and explicit refresh and removal actions.
- Start with SQLite text search and measured ranking. Add local embeddings only if the evaluation shows a retrieval gap they solve; a separate vector service is not assumed.
- Retrieve a small set of passages within a defined context budget. Treat imported content as evidence, never as trusted instructions.
- Preserve distinctions between the user's contribution, team work, outcomes and suggested wording.
- Define how removals affect the index and disclose that already-saved answers may still contain excerpts.

Completion checks:

- [x] Representative questions retrieve expected source passages, including differently worded queries and no-match cases (synthetic corpus tests; personal-corpus evaluation pending).
- [ ] Personal claims can be traced to imported passages and their Notion pages.
- [x] Re-import is idempotent; edits and removals update retrieval without duplicate records.
- [x] Failed refreshes are visible and do not silently present old material as newly synced.
- [x] Tests prove another user cannot import into, search or read this user's corpus.
- [ ] Malicious instructions inside source text do not change tool permissions or override trusted instructions.

Verification on 2 November 2026:

- `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm build` passed, including 86 backend tests. Existing message migration and evidence snapshots after restart are covered.
- `pnpm test:e2e` passed all 39 browser tests against isolated storage. Import, inspection, retrieved links, refresh/re-import failure, stale-source exclusion, removal and saved snapshots were exercised with synthetic Notion data.
- Desktop and mobile screenshots were inspected: `test-results/experience-desktop.png` and `test-results/experience-mobile.png` (overwritten by future runs).
- Independent review identified stale UI after failed re-import and whitespace-only import chunks. Both were fixed with regression checks; final review had no remaining actionable findings.
- Permission enforcement is verified: source text cannot grant tools, even if a provider requests one. Real-model resistance to misleading instructions and fidelity of personal claims/citations remain unverified; those acceptance boxes remain open.
- No personal Notion pages, live credentials, deployed services or real models were used. The owner must configure `NOTION_TOKEN` privately, select a page, and evaluate its copied content and answers when the PC is available.

## IA-3 — Technical reasoning and conversational follow-ups

Status: implemented and locally verified; real-model acceptance pending. Depends on IA-2.

Implemented: up to four recent questions and explicit “What I actually said” notes, bounded prompt admission, follow-up retrieval and a new-topic reset. Generated suggestions are excluded from conversation context. Context is held only in the interview view, not restored from saved history; generated replies may quote it. Current questions and experience samples are never silently truncated; older complete turns can be omitted to fit the prompt budget. Retrieval prioritizes the current question and recent context with a conservative English follow-up heuristic. Tools remain disabled; no live research or audio capture is added.

The evaluation harness now has 36 turns: 24 standalone cases plus four three-turn sequences covering technical explanations, design tradeoffs, mixed experience and topic changes. The Windows PC remains unavailable, so model quality, timing, GPU memory, executable examples and human review remain pending.

**Outcome:** The typed assistant handles realistic sequences of behavioural and technical questions reliably enough to justify live input.

Scope:

- Maintain bounded interview context, including explicit user-entered summaries of what was actually said. Generated suggestions must not be treated as spoken answers.
- Handle follow-ups such as “Why that approach?” and “What if that fails?” without losing the referenced topic.
- Provide clarifying questions when requirements are incomplete; make technical assumptions and uncertainty visible.
- Evaluate the existing local model first. Compare other local models only if quality or timing fails agreed targets, measuring GPU memory and context costs on the actual PC.
- Keep technical knowledge limitations visible. Live web research and external interview-platform integrations are outside this track.

Completion checks:

- [x] Multi-turn evaluation cases cover technical explanations, design tradeoffs, mixed experience questions and topic changes; transport is verified with a fake local provider, real-model scoring remains pending.
- [ ] Technical answers meet the agreed rubric under human review; code examples receive appropriate executable checks where practical.
- [ ] Answers do not confuse suggested approaches with the user's past experience or spoken statements.
- [ ] Retrieval, context size and generation together meet the agreed quality and latency targets.
- [ ] Model configuration, measured limitations and failing cases are recorded reproducibly.

Verification on 2 November 2026:

- `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm build` passed, including 90 backend tests. Existing non-blocking build chunk-size warning remains.
- `pnpm test:e2e` passed all 44 browser tests against isolated storage, including follow-up payloads, rejection, accepted-stream interruption, failed history refresh, four-question retention, topic reset and leaving the view.
- Backend checks cover strict context validation, complete-turn budget admission, multi-hop retrieval, topic changes, search-term priority and owner isolation. Generated suggestions are excluded from provider context; tools remain disabled.
- The 36-turn evaluation harness passed its schema dry run and temporary loopback fake-provider success/failure runs. See [evaluation evidence and remaining acceptance work](docs/interview-evaluation.md).
- Independent review found accepted questions could be omitted from context after a stream or final history-refresh failure. Context now advances at server acceptance; regressions cover both failures and rejection before acceptance. Final independent review has no remaining actionable findings.
- Desktop and mobile context controls were inspected. Browser evidence is generated in `test-results/interview-context-{desktop,mobile}.png` and overwritten by later test runs.
- No real model, personal Notion corpus, model installation, live audio or external deployment was used. Human answer review, executable checks of generated examples and measured quality/latency targets remain open.

## IA-4 / IA-4a — Native capture experiment (removed)

The native Mac capture/transcription and browser-to-helper pairing experiments were superseded by the user's browser-only requirement. Their Swift code, pairing/control endpoints, credential storage implementation, shared schemas, scripts and setup documentation were removed before committing IA-4b. The installed development helper and local experiment assets were moved to Trash. No native helper is part of the product or required for browser capture.

The experiment established that native capture was possible, but it did not satisfy the intended installation-free browser experience. Its transcription measurements do not validate future browser-local inference. IA-4b and IA-4c replace these milestones.

## IA-4b — Browser-only audio capture feasibility

Status: implemented; browser-tab capture verified locally. Entire-screen/native-app capture acceptance remains pending. Supersedes the native-helper product direction in IA-4 and IA-4a. The Swift experiment and its integration code have been removed.

**Outcome:** Open Interview in Panky, press **Start listening**, select a source in the browser's sharing picker, and see separate shared-audio and microphone levels without installing or launching a helper.

Browser permissions and a source picker are required; a website cannot silently acquire arbitrary Mac audio. Requesting shared audio does not guarantee that the chosen browser/source provides it. A browser-tab capture success does not establish native-call-app or full-system capture support.

Implementation and checks:

- Replace helper pairing UI with direct `getDisplayMedia` and separate `getUserMedia` capture. Require a returned shared-audio track; never silently substitute microphone-only capture.
- Measure separate streams with Web Audio meters. Keep samples ephemeral; do not record, upload, play back, or persist audio or screen frames.
- Show unsupported, denied, missing-audio, silent-source and active states honestly. The display API requires a video track, but Panky does not render or process its frames.
- Stop/Pause, leaving Interview, browser share termination, and late permission resolutions must release streams and audio contexts. A fresh Start opens a new picker.
- Test lifecycle and error handling with controlled media streams. Separately test the actual installed browser picker on this Mac; record browser/source, audio track availability and observed signal, without treating mocks as capture evidence.
- Run checks/build and browser regressions; obtain independent lifecycle review.

No model download or native app launch belongs to this milestone.

Observed feasibility (2 November 2026): Chrome 156.0.8078.80 on this Mac offered **Share with tab audio**. The production capture component, mounted in an isolated temporary page without backend access, captured a controlled 440 Hz WAV from a second tab. The shared meter read about 22/100 while the separate microphone meter read about 0.35/100. Stop set both meters to zero and removed Chrome's sharing/microphone indicators. No captured samples were saved. The temporary source and harness were removed afterward. An earlier generated oscillator attempt stayed silent; the WAV test established actual tab signal rather than relying on track presence.

The **Entire screen** picker required Chrome screen-recording permission in System Settings and a Chrome restart. Neither the user's browser restart nor full-system/native-call-app capture was performed. Tab success must not be presented as proof of full Mac audio support. Browser-local transcription remains IA-4c, not part of this capture test.

Verification: nine focused browser tests pass with controlled media streams and real Web Audio, covering separate meters, missing shared audio, denied permissions, unsupported APIs, Stop/Pause/navigation, ended tracks and late permission cleanup. Independent read-only review reported no actionable findings. After removing the native experiment, `pnpm check` and `pnpm build` pass, all 53 browser tests pass, and independent cleanup review found no actionable code or security issues. No native runtime dependency remains. The existing bundle-size advisory remains non-blocking.

## IA-4c — Browser-local transcription

Status: implemented and controlled integration verified. Browser-tab capture is verified; human interview quality and full-system/native-app capture acceptance remain pending.

Implemented: pinned Whisper tiny.en q8 runs in a browser worker on WASM. Load/cancel/remove controls manage a dedicated model cache. Separate AudioWorklets resample input to 16 kHz mono and deliver five-second chunks. Inference is serial with two queued chunks; overflow/error stops listening. Stop terminates the worker and drops pending work. Up to 50 source-labelled transcript segments remain only in the current view. No automatic question generation or audio upload. See [setup and verification](docs/browser-audio.md).

- Run a local speech model in a browser worker using a supported WASM/WebGPU runtime. Make model download size, progress and cache removal explicit.
- Preserve separate microphone/shared streams, bounded queues, cancellation and no raw-audio upload. Do not use a speech API that silently sends audio to a cloud service.
- Show source-labelled transcript text and measure warm/cold latency, memory, accuracy and chunk boundaries on this Mac.
- Verify full browser capture-to-transcript behavior before accepting live interview use. Revisit call location if only browser-tab audio is supported; do not reintroduce a native helper without an explicit decision.

Verification evidence (2 November 2026):

- Three real AudioWorklet tests passed: 44.1/48 kHz conversion, separate source values, Stop cleanup and bounded-delivery overflow. Twelve capture/transcript UI tests passed, including model failure, late-result rejection, model-cache isolation and slow-inference overload.
- Real WASM model evaluation in Chromium 156.0.8078.4 took 3.74 seconds to load and 1.25 seconds to reload from cache. A five-second chunk processed in 1.01–1.12 seconds; the two serial source results arrived about 6.16 and 7.17 seconds after capture started. These are one controlled run, not performance guarantees.
- Generated speech “I led a database migration with a rollback plan” became “I let a database migration with the rollback plan” on both streams. The test establishes source-to-text integration, and also demonstrates recognition errors.
- The real-model production-build test passed with source-labelled transcripts, stopped tracks and dedicated cache deletion. The standalone evaluator observed zero network writes. Tests use generated speech, not recorded microphone audio, and an isolated in-memory backend.
- Independent implementation and production-harness reviews found no actionable issues. `pnpm check` passes (90 backend tests, lint, formatting and typechecks), all 59 browser regression tests pass, and the production build passes. A separate opt-in production speech test also passed with the real model.

Remaining acceptance: sustained memory measurement, human/technical speech accuracy, speech crossing five-second boundaries, overlapping speakers, full-system/native-call-app capture and agreed latency/accuracy targets. Fixed RMS filtering can miss quiet speech. No live-interview acceptance is claimed from generated speech tests.

## IA-5 — Live question detection and suggestions

Status: not started. Depends on IA-4c.

**Outcome:** Spoken interview questions become editable question cards and useful suggestions in the panel.

Scope:

- Combine partial transcription into stable utterances and detect question completion, including prompts such as “Walk me through…”.
- Start with a “Use this question” action and keyboard shortcut. Add opt-in automatic generation only after manual mode passes evaluation.
- Use microphone transcripts for conversational context while avoiding treating the user's answer as a new interviewer question.
- Show relevant experience excerpts as soon as available, then stream generated cues without repeatedly replacing content the user is reading.
- Handle question revisions and topic changes explicitly; late results must stay attached to their original question.
- Preserve one active response globally. Define busy and supersession behaviour without automatic submission retries or an unbounded queue.

Completion checks:

- [ ] Controlled sessions test compound questions, follow-ups, corrections, long pauses and interruptions.
- [ ] Each accepted question creates at most one generation; transcription revisions do not cause duplicate submissions.
- [ ] Old responses never overwrite a newer question's panel.
- [ ] Measure question-end-to-first-useful-cue across capture, transcription, detection, retrieval, network and generation against agreed targets.
- [ ] The user can correct, dismiss, request and stop suggestions while remaining engaged in the conversation.
- [ ] Automatic mode, if enabled, meets agreed false-trigger and missed-question targets on recorded test cases.

## IA-6 — Reliability and live-use readiness

Status: not started. Depends on IA-5.

**Outcome:** The complete workflow survives a realistic practice interview and has clear operational limits.

Scope:

- Run a full-length controlled practice interview covering behavioural, technical and mixed questions.
- Exercise the actual Mac-to-PC route, including cold model startup, sleeping/offline PC, network loss, backend restart and a competing user request.
- Verify retention, deletion, user isolation, credential handling and capture indicators across the complete system.
- Keep external deployment or provisioning separate and explicitly authorized. Local success does not prove the deployed route works.
- Document setup, required permissions, source refresh, model configuration, recovery and known limitations.

Completion checks:

- [ ] End-to-end quality and latency results meet the agreed targets over a full practice session.
- [ ] Faults produce clear states without losing question ownership, duplicating requests or claiming stale results are current.
- [ ] Existing chat, authentication, cancellation and history behaviour still passes regression checks.
- [ ] Source and transcript deletion and cross-user isolation are verified with isolated data.
- [ ] The user reviews the practice session and agrees the panel is useful before treating it as ready for live interviews.

## Working through each milestone

1. Review the milestone, inspect current code and resolve only the decisions needed for that stage.
2. Record a short implementation plan and observable acceptance targets. Keep later milestones out of scope.
3. Build the smallest complete flow using existing boundaries and Pancake UI components and tokens.
4. For implementation changes, run `pnpm check` and `pnpm build`; run `pnpm test:e2e` for UI or API contract changes. Use isolated databases and synthetic fixtures, never live conversations as test data.
5. Run the milestone's hardware or real-model evaluations separately. Record what was mocked, what was measured and what remains unverified.
6. Update this plan's status and the README with results, limitations and operational changes.
7. Review the outcome together before beginning the next milestone.

## Deferred scope

Fine-tuning, cloud inference, unrestricted tools, autonomous external actions, background routines, hidden capture, screen/OCR ingestion and interview-platform automation are not part of this plan. Embeddings, automatic question triggering and a different local model require evidence from the preceding milestones rather than being default dependencies.

## Reference candidates

These support the feasibility discussion, not a completed integration. Recheck runtime compatibility during IA-4c.

- [Apple ScreenCaptureKit capture sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [Notion page-content extraction example](https://github.com/makenotion/notion-cookbook/blob/main/examples/parse-text-from-any-block-type/README.md)
