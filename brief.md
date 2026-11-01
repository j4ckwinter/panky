# Panky — Project Brief

## Overview

Build Panky: a personal AI teammate with a web interface, eventually powered by a local AI model running on my Windows PC.

Panky should receive tasks, use tools, retain context and report its results. Build it incrementally, with a working, verifiable result at each milestone.

This document describes the roadmap. Implement Milestone 1 only to begin with. Future milestones provide direction, not permission to build ahead.

## Development Context

- Development starts on my MacBook.
- Do not install Ollama, download models or require a local AI runtime on the Mac.
- Use a deterministic mock model provider initially.
- The eventual host is a Windows PC with an RTX 3070 (8GB VRAM) and approximately 32GB RAM.
- Ollama will run on that PC.
- The frontend will deploy to Vercel.
- I want web access from the first working milestone.
- Initially, the backend runs on my Mac, accessible through a secure tunnel.
- Later, the backend moves to my Windows PC.
- The host computer must remain awake and connected for Panky to work.

## Stack and Repository

Use:
- TypeScript throughout.
- React and Vite for the frontend.
- Node.js for the backend.
- SQLite for persistence.
- pnpm workspaces.
- Biome for linting and formatting.

Repository structure:
- apps/web — frontend, deployed to Vercel.
- apps/server — backend, running on my computer.
- packages/shared — shared API schemas and types.

Keep frontend and backend independently runnable and deployable. Do not add Turborepo or additional infrastructure without a concrete need.

Use my component library:
https://github.com/j4ckwinter/pancake-ui

Inspect its documentation, exports and styling conventions before integrating it. Prefer existing components and tokens. Do not invent its API if access or installation fails.

Use stable, mutually compatible dependencies and check official documentation when needed.

## Engineering Standards

Establish these before implementing features:
- Strict TypeScript.
- Biome configuration.
- Appropriate ignore files.
- Committed lockfile.
- Documented environment examples without secrets.
- CI running the same checks used locally.

Provide commands for:
- dev
- build
- lint
- format
- format:check
- typecheck
- test
- check

The root check command should run linting, formatting verification, typechecking and relevant tests.

Create a concise root AGENTS.md documenting:
- Project structure and commands.
- Module boundaries.
- Verification requirements.
- Important security constraints.

Code organisation:
- Give each module a clear responsibility.
- Separate UI, orchestration, model providers and persistence.
- Keep route handlers thin.
- Organise code around features.
- Extract shared code when there is real reuse.
- Treat files approaching 300 lines as a review trigger, not an absolute limit.
- Split files when responsibilities diverge.
- Avoid giant components, catch-all utilities and speculative abstractions.
- Do not create empty layers for future milestones.

Quality:
- Avoid explicit any and unjustified error suppressions.
- Validate external input at system boundaries.
- Handle errors explicitly.
- Never log secrets.
- Test meaningful behaviour.
- Run required checks before reporting completion.
- Report verification gaps honestly.

## Milestone 1 — Web Chat Foundation

### Goal

Open Panky through a Vercel-hosted interface, send messages to a backend running on my Mac, receive streamed mock replies and retain conversations after refresh.

No local AI runtime is required.

### Interface

Build:
- Panky branding.
- Conversation sidebar.
- New conversation action.
- Message history and composer.
- Streamed assistant responses.
- Clear loading, connection and error states.
- Responsive desktop and mobile layouts.
- Visible mock-provider indicator.

Use Pancake UI. Keep the design clean and personable.

Do not build dashboards or extensive settings screens.

### Backend

Implement:
- Conversation and message endpoints.
- SQLite persistence.
- A small model-provider interface.
- A deterministic mock provider.
- Streamed responses.
- Request validation and clear errors.
- One active response at a time, enforced server-side.

Keep provider selection, endpoint and model name configurable. Only mock mode needs to work at this stage.

Persist completed messages accurately. Define what happens when a response is interrupted or the browser disconnects. Do not duplicate message submission automatically on reconnect.

### Web Access

Architecture:
Browser → Vercel frontend → HTTPS tunnel → local backend.

Requirements:
- Configurable frontend backend URL.
- Backend bound locally by default.
- Streaming compatible with the chosen tunnel.
- Explicit allowed frontend origins.
- Authentication protecting conversation and streaming endpoints.
- No secrets embedded in the frontend bundle.
- No credentials in URLs or logs.
- CORS must not be treated as authentication.

Choose a simple, established single-user authentication and tunnel approach using current official documentation. Consider the deployed frontend and backend being on different origins.

Prepare deployment configuration and exact setup instructions. Do not create accounts, deploy or provision external services without explicit instruction.

Remote access is only complete once the required external setup has been performed and verified. Clearly distinguish prepared configuration from verified deployment.

### Acceptance Criteria

- The app runs locally with documented commands.
- Messages stream through the real backend.
- Conversations survive refresh and backend restart.
- The interface clearly identifies mock responses.
- Unauthenticated requests are rejected.
- Concurrent submissions are handled cleanly.
- A Vercel build succeeds.
- Deployment and tunnel setup are documented.
- Required checks pass.
- Browser behaviour is verified where tooling is available.

## Milestone 2 — Tool Execution and Task Activity

### Goal

Demonstrate a complete task loop using the mock provider and one real, harmless tool.

### Agent Loop

Extend the provider interface to support:
- Structured tool requests.
- Tool results.
- Completion and errors.
- Cancellation.

Implement a bounded loop:
1. Send conversation context and available tools.
2. Receive text or a tool request.
3. Validate the tool and arguments.
4. Execute the allowed tool.
5. Return the actual result to the provider.
6. Continue until completion, cancellation or a step limit.

Start with one tool: get the current date and time.

Create a documented demo prompt that:
- Produces a structured tool request.
- Executes the backend tool.
- Uses the actual result in the final response.

Do not present scripted activity as real tool execution.

### Task Interface

Add:
- Activity panel.
- Tool requests and results.
- Running, completed, failed, cancelled and interrupted states.
- Cancel button.
- Clear explanations of failures.

### Reliability

- Enforce one active task globally.
- Reject a second task cleanly.
- Validate tool arguments.
- Reject unknown tools.
- Handle tool failures.
- Propagate cancellation.
- Prevent further tool execution after cancellation.
- Persist task runs and activity.
- Mark unfinished tasks as interrupted after backend restart.
- Never silently rerun tools after refresh or reconnection.
- Apply a configurable conversation-history budget and document its limitations.

### Acceptance Criteria

- The full mock/tool/result loop works.
- Activity reflects actual backend events.
- Cancellation and step limits terminate work correctly.
- Refresh restores recorded activity.
- Restart marks unfinished work as interrupted.
- Tests cover the important lifecycle and failure cases.

## Milestone 3 — Local AI on the Windows PC

### Goal

Replace the mock provider with an Ollama provider running on my Windows PC.

Begin this milestone only when the PC is available. Do not install Ollama on the Mac.

### Implementation

- Implement the Ollama provider using current official documentation.
- Keep the mock provider available for development and tests.
- Configure the model and endpoint through backend environment variables.
- Keep Ollama private; only the backend communicates with it.
- Support streamed text, tool requests, tool results and cancellation.
- Handle unavailable models, connection failures and malformed tool requests.
- Document Windows setup and moving persistent data from the Mac.
- Use portable paths and scripts where practical.

### Model Evaluation

Choose a model suitable for the actual hardware after measuring:
- Response speed.
- GPU memory use.
- Tool-call correctness.
- Behaviour with conversation history.
- Ability to follow instructions and recover from tool errors.

Start with short context and one active task. Do not assume the model's advertised maximum context fits in GPU memory.

Do not treat successful mock tests as evidence of real-model reliability.

### Acceptance Criteria

- Panky responds through the PC's local model.
- GPU use is confirmed.
- The date-and-time tool loop works with the real model.
- Failures are visible and understandable.
- Remote web access works with the PC as backend host.
- Measured limitations are documented.

## Milestone 4 — One Useful Workflow

### Goal

Make Panky useful for one narrowly defined real task.

Choose the workflow with me before implementing it. A candidate is investigating a GitHub issue and returning evidence-backed findings.

### Principles

- Prefer APIs and structured tools before browser automation.
- Add only tools needed for the chosen workflow.
- Start with read-only access.
- Keep credentials on the backend.
- Limit tool outputs and context size.
- Show sources and distinguish findings from inference.
- Define success and failure before implementation.

If the workflow requires repository access, explicitly restrict it to configured repositories or workspace directories.

### Acceptance Criteria

- The workflow completes on representative examples.
- Results include inspectable evidence.
- Failures are recoverable and clearly reported.
- Tool permissions remain limited to the workflow.
- Real-model evaluations reveal where human assistance is needed.

## Milestone 5 — Controlled Actions and Approvals

### Goal

Allow Panky to make a small set of useful changes with explicit controls.

Select actions based on the workflow already proven in Milestone 4.

### Requirements

- Define permissions per tool.
- Separate proposed actions from executed actions.
- Require approval for selected consequential actions.
- Show the exact action being approved.
- Bind approval to the specific arguments and task.
- Record approvals and outcomes.
- Prevent duplicate execution after retries or reconnects.
- Support cancellation and clear recovery behaviour.
- Use isolated working directories for code changes.

Do not introduce unrestricted shell or filesystem access as a shortcut.

### Acceptance Criteria

- Users can inspect and approve a concrete action.
- Unapproved actions cannot execute.
- Changed arguments invalidate prior approval.
- Retries do not duplicate external effects.
- Results and failures are recorded accurately.

## Milestone 6 — Routines and Longer-Term Context

### Goal

Add repeatable work once interactive workflows are reliable.

Potential features:
- Saved task instructions.
- Scheduled routines.
- Task queue.
- Selected persistent preferences and project context.

### Requirements

- Keep routines explicit and editable.
- Define behaviour when the PC is asleep or offline.
- Bound runtime, steps and retries.
- Make scheduled activity visible.
- Prevent overlapping or duplicate runs.
- Support pausing and deleting routines.
- Let me inspect, correct and delete saved memory.
- Keep retrieved content separate from trusted system instructions.

Only introduce embeddings or Brain-Cache integration when the selected workflow demonstrates a need.

### Acceptance Criteria

- A saved routine runs reliably.
- Missed schedules and failures have defined behaviour.
- Memory is inspectable and controllable.
- Background work stays within configured permissions and limits.

## Not in the Initial Scope

- Multiple agents.
- Multi-user accounts.
- Billing.
- Unrestricted computer control.
- Arbitrary terminal execution.
- Broad filesystem access.
- Autonomous external messaging.
- Cloud-model fallback.
- Vector databases.
- A complex plugin framework.

These can be considered later if a demonstrated need justifies them.

## Working Process

For each milestone:
1. Inspect existing code and applicable instructions.
2. State a short implementation plan.
3. Build the smallest complete version.
4. Run appropriate checks.
5. Inspect the interface in a browser when available.
6. Fix issues found.
7. Update the README.
8. Report what works, what was verified and remaining gaps.

Do not implement future milestones early. At completion, identify the next milestone without beginning it automatically.

Keep the README current with:
- Setup and development commands.
- Architecture and repository structure.
- Environment configuration.
- Authentication and secure remote access.
- Deployment instructions.
- Current milestone status.
- Mocked versus real behaviour.
- Known limitations.

Start with Milestone 1.