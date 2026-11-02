# Panky Interview Assistant — Milestone Plan

Status: IA-1 implemented and locally verified; real-model acceptance pending. IA-2 onward have not started.

## Outcome

Build an assistant that sits beside a live interview, recognises questions from Mac call audio, and shows concise help in Panky:

- Behavioural and project questions: relevant experience, personal contributions, outcomes and links to the original Notion notes.
- Technical questions: explanations, clarifying questions, approaches, tradeoffs and failure cases.
- Mixed questions and follow-ups: technical reasoning grounded in the user's experience and the current conversation.

The interface should offer a few useful cues at a glance, with supporting detail available on demand. It must distinguish documented experience from suggested reasoning and never invent achievements or metrics.

## Relationship to the existing roadmap

This is a proposed implementation track for the “One Useful Workflow” direction in [brief.md](brief.md). Its milestones use the prefix IA to avoid conflicting with the existing project milestones. It does not schedule the broader approvals, routines or automation roadmap.

Milestone 3 remains the baseline. The user authorized IA-1 implementation and verification on 2 November 2026; [AGENTS.md](AGENTS.md) permits that slice while retaining the restriction on later work. Other safeguards remain in force.

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

Keep the React UI and authenticated API client in `apps/web`, retrieval and orchestration in separate server feature modules, and runtime API contracts in `packages/shared`. Decide the Mac companion's packaging after the capture feasibility check; do not force native platform code into the TypeScript server.

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

Status: not started. Depends on IA-1.

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

- [ ] Representative questions retrieve expected source passages, including differently worded queries and no-match cases.
- [ ] Personal claims can be traced to imported passages and their Notion pages.
- [ ] Re-import is idempotent; edits and removals update retrieval without duplicate records.
- [ ] Failed refreshes are visible and do not silently present old material as newly synced.
- [ ] Tests prove another user cannot import into, search or read this user's corpus.
- [ ] Malicious instructions inside source text do not change tool permissions or override trusted instructions.

## IA-3 — Technical reasoning and conversational follow-ups

Status: not started. Depends on IA-2.

**Outcome:** The typed assistant handles realistic sequences of behavioural and technical questions reliably enough to justify live input.

Scope:

- Maintain bounded interview context, including explicit user-entered summaries of what was actually said. Generated suggestions must not be treated as spoken answers.
- Handle follow-ups such as “Why that approach?” and “What if that fails?” without losing the referenced topic.
- Provide clarifying questions when requirements are incomplete; make technical assumptions and uncertainty visible.
- Evaluate the existing local model first. Compare other local models only if quality or timing fails agreed targets, measuring GPU memory and context costs on the actual PC.
- Keep technical knowledge limitations visible. Live web research and external interview-platform integrations are outside this track.

Completion checks:

- [ ] Multi-turn evaluations cover technical explanations, design tradeoffs, mixed experience questions and topic changes.
- [ ] Technical answers meet the agreed rubric under human review; code examples receive appropriate executable checks where practical.
- [ ] Answers do not confuse suggested approaches with the user's past experience or spoken statements.
- [ ] Retrieval, context size and generation together meet the agreed quality and latency targets.
- [ ] Model configuration, measured limitations and failing cases are recorded reproducibly.

## IA-4 — Mac audio capture and local transcription

Status: not started. Depends on IA-3.

**Outcome:** A Mac companion produces readable interview transcripts from call audio and the user's microphone.

Scope:

- First verify capture feasibility on the user's macOS version, hardware and chosen call application using controlled test audio.
- Assess ScreenCaptureKit for call audio and a local speech-to-text runtime such as whisper.cpp. Recheck official documentation before choosing dependencies.
- Measure transcription accuracy and speed before committing to companion packaging or model size. Model installation on the Mac requires reconciling the existing brief's restrictions for this purpose.
- Keep call audio and microphone inputs distinguishable. Do not promise individual speaker identification within a mixed call stream.
- Provide visible start, pause and stop controls, permission explanations and input status. Use controlled practice calls with participants aware of capture during validation.
- Define an authenticated, revocable companion connection. Do not reuse the owner's bearer secret in browser storage, URLs or frontend configuration.
- Discard raw audio by default. Choose transcript retention explicitly; disclose whether text travels through the current proxy/tunnel path.
- Bound buffering and define behaviour for sleep, input-device changes, permission loss and backend disconnection.

Completion checks:

- [ ] Capture works with the selected call app and headphones, including both sides of a controlled conversation.
- [ ] Technical terms, pauses, interruptions and overlapping speech are represented in an accuracy evaluation.
- [ ] Transcription meets agreed accuracy and delay targets on the actual Mac.
- [ ] Pause and stop end capture; revoking the companion prevents further ingestion.
- [ ] Disconnect and resume behaviour is visible, bounded and does not silently replay stale audio.
- [ ] No raw recording is persisted by default, and transcript storage matches the selected policy.

## IA-5 — Live question detection and suggestions

Status: not started. Depends on IA-4.

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

These support the feasibility discussion, not a completed integration. Recheck platform compatibility during IA-4.

- [Apple ScreenCaptureKit capture sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [Notion page-content extraction example](https://github.com/makenotion/notion-cookbook/blob/main/examples/parse-text-from-any-block-type/README.md)
