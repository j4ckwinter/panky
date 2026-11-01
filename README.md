# Panky

A personal chat workspace. Milestone 2 uses a deterministic mock provider with one real tool: reading the current date and time. No AI model or local AI runtime is involved.

The React frontend calls a separate Node backend. SQLite stores conversations on the backend host. Production access follows `browser → Vercel frontend → HTTPS tunnel → local backend`; the browser makes authenticated requests directly to the tunnel origin.

## Run locally

Use Node 24+ and pnpm 12.16.1. From the repository root:

```sh
pnpm install --frozen-lockfile
cp -n apps/server/.env.example apps/server/.env
cp -n apps/web/.env.example apps/web/.env
```

Generate a token with `openssl rand -hex 32`, save it as `AUTH_TOKEN` in `apps/server/.env`, and keep a copy in your password manager. Do not commit this file. Then:

```sh
pnpm dev
```

Open http://localhost:5173 and enter the token in **Access token**. Choose **Connect**, then **New conversation**, enter a message, and select **Send message**. Enter sends the message; Shift+Enter adds a new line. The reply arrives incrementally from the backend. Reload, reconnect with the token, and select the conversation to restore history.

The token is kept only in browser memory, so refresh requires signing in again. This trades persistent login convenience for avoiding credentials in browser storage. Conversation data remains in SQLite regardless of browser sign-in state.

Run either app independently with `pnpm --filter @panky/web dev` or `pnpm --filter @panky/server dev`. For production builds, use `pnpm build`; start the compiled backend with `pnpm --filter @panky/server start`. Preview the built web app with `pnpm --filter @panky/web preview` and add its exact origin to the backend allowlist if using a different port.

## Try the date-and-time tool

Start a new conversation and send this exact demo prompt:

> What is the current date and time?

The mock provider emits a structured `get_current_datetime` request with `{}` arguments. The backend validates and executes that tool using its actual clock, records the UTC result, and passes the result back to the mock provider. The final reply uses that returned timestamp. The provider remains scripted; the timestamp and tool execution are real.

Open **Task activity** to inspect the request, arguments, result, and task status. The latest activity is shown during a run; refresh restores recorded activity without executing tools again. **Cancel task** asks the server to stop the active task. Completed, failed, cancelled, and interrupted tasks remain in the conversation history.

Ordinary prompts still receive deterministic mock replies without tools. Only the documented date-and-time prompt triggers the clock demonstration. No shell, filesystem, external messaging, or other tools are available.

## Commands and structure

| Command             | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `pnpm dev`          | Run both apps                                          |
| `pnpm build`        | Typecheck shared schemas and build both apps           |
| `pnpm lint`         | Biome lint                                             |
| `pnpm format`       | Format source                                          |
| `pnpm format:check` | Verify formatting                                      |
| `pnpm typecheck`    | Strict TypeScript checks                               |
| `pnpm test`         | Backend behavior tests using isolated SQLite databases |
| `pnpm check`        | Lint, formatting, typechecking, backend tests          |
| `pnpm test:e2e`     | Chromium tests against the real backend                |

Install the test browser once with `pnpm exec playwright install chromium`. CI runs `pnpm check`, `pnpm build`, and the browser suite using the lockfile. Browser tests own ports 3101 and 5174 and use an isolated in-memory database and a public test-only token. Do not reuse that token for real access.

- `apps/web`: React/Vite UI, Pancake UI components and tokens, API client.
- `apps/server`: HTTP validation/authentication, chat orchestration, mock provider, SQLite persistence.
- `packages/shared`: Zod API schemas and inferred TypeScript types.
- `tests`: browser integration tests.

## Configuration

Server environment variables are loaded from `apps/server/.env` by the package scripts:

| Variable               | Default / requirement                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `AUTH_TOKEN`           | Required, at least 32 characters; generate a random token                                               |
| `HOST`                 | `127.0.0.1`; keep loopback when using the tunnel                                                        |
| `PORT`                 | `3001`                                                                                                  |
| `DATABASE_PATH`        | `./data/panky.sqlite`, relative to the server working directory                                         |
| `ALLOWED_ORIGINS`      | Explicit comma-separated frontend origins; local defaults `http://localhost:5173,http://127.0.0.1:5173` |
| `MODEL_PROVIDER`       | `mock`; unsupported providers fail startup                                                              |
| `MODEL_NAME`           | `panky-mock`                                                                                            |
| `MODEL_ENDPOINT`       | Optional future provider endpoint; unused in mock mode                                                  |
| `MAX_TASK_STEPS`       | `8`; provider turns per task, from 1 to 32                                                              |
| `HISTORY_MAX_CHARS`    | `16000`; context character budget, from 8000 to 128000                                                  |
| `MAX_TASK_DURATION_MS` | `30000`; task deadline in milliseconds, from 100 to 300000                                              |

Frontend `VITE_API_URL` is a public backend origin, defaulting to `http://localhost:3001`. Set it to your HTTPS tunnel origin for deployment. Vite embeds it at build time, so changes require a rebuild. Never define a frontend variable containing the access token. HTTPS is required except for loopback development URLs.

## Authentication and persistence

All API endpoints, including health and streaming, require an `Authorization: Bearer …` header. The token is a pre-shared single-user credential, not a complete OAuth login system. Bearer header transport follows [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750). Use HTTPS remotely, rotate the token by changing the server environment and restarting, and reconnect with the new token. There are no authentication cookies, so this works across the Vercel and tunnel origins without third-party cookies. Tokens never belong in URLs or logs.

CORS allows only configured frontend origins. Preflight requests are permitted without a token; actual API requests still require authentication. CORS is not authentication, and non-browser clients also require the token.

Only one task can run at a time across all conversations. A conflicting submission returns HTTP 409 without adding messages. User, assistant, and task records are created together; streamed assistant text is saved as it is produced. Completion is recorded before the final stream event. A disconnected browser aborts generation and leaves an **interrupted** assistant record with any saved partial text. Backend startup marks unfinished task and streaming-message records interrupted and records that recovery in task activity. No tools are restarted. A disconnect after completion may lose the final browser event, but refreshing history reveals the completed record.

Cancellation is distinct from interruption. A successful cancel request records `cancelled`; browser disconnection or backend shutdown records `interrupted`. Invalid tool requests, tool/provider failures, exhausted step limits, and task deadlines record `failed` with an explanation. Partial assistant text remains saved with message status `interrupted`; the separate task status explains whether it failed, was cancelled, or lost its connection. Terminal message, task, and activity updates are saved together.

The client never retries a message automatically. After a network error, refresh history before manually sending again: a request can have been accepted even if its acknowledgement was lost. A manual second submission is a new message. Run one backend process per database; clustering and multiple backend replicas are not supported.

SQLite files contain plaintext conversations. Keep the data directory private. For backup, stop the server and copy the database and any SQLite sidecar files together. No cloud backup, encryption-at-rest, retention policy, or deletion interface is included in this milestone.

## Task limits and compatibility

`MAX_TASK_STEPS` limits provider turns, including the final completion turn. The clock demo needs two turns: request the tool, then consume its result and reply. `MAX_TASK_DURATION_MS` bounds task runtime. Cancellation is propagated to the provider and tool; the backend checks it again before executing another tool and retains the global task slot until the current work settles.

`HISTORY_MAX_CHARS` limits the message text passed to the provider. This is a character budget, not a model token budget. It does not delete stored history. Older content can be omitted, so a model may not see earlier instructions; activity records how much history was included and how many messages were omitted. New tool results and intermediate assistant text also count toward this budget; exceeding it stops the task with a recorded failure. This simple policy must be evaluated again before introducing a real model.

Existing Milestone 1 databases receive additive task/activity tables at startup. Existing messages are retained and do not get invented historical tool activity. The new web client opts into activity events with `includeActivity: true`; older clients retain the text stream contract. Update backend code before deploying the new frontend. Back up the database before upgrading and run only one backend process against it.

Tests use isolated in-memory or temporary SQLite databases. Do not run verification prompts against the live database; they create persistent conversations visible on login.

## Prepare remote access

The frontend runs on Vercel and the backend stays on your Mac. Both the backend and the tunnel must remain running, and the Mac must stay awake and connected. You need Vercel and ngrok accounts; no purchased domain is required.

### 1. Start the ngrok tunnel

Install ngrok and configure its account authtoken in your own terminal:

```sh
brew install ngrok
ngrok config add-authtoken "YOUR_NGROK_AUTHTOKEN"
ngrok http http://127.0.0.1:3001 --inspect=false
```

The ngrok account token is different from Panky's `AUTH_TOKEN`. Keep both private. `--inspect=false` disables local HTTP request inspection, which would otherwise capture authentication headers and conversation content. Keep this terminal open. Copy the public HTTPS URL ngrok assigns you.

The frontend sends ngrok's documented `ngrok-skip-browser-warning` header when the API hostname ends in `.ngrok-free.dev`, `.ngrok-free.app`, or `.ngrok.app`. The backend permits that header in preflight requests; bearer authentication is still required for every API request. See [ngrok macOS setup](https://ngrok.com/download/mac-os) and [free-plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits). The free plan has usage limits; it is suitable for this development setup, not a claim of production availability.

A named Cloudflare tunnel remains an alternative if you later have a Cloudflare-managed domain. Do not use a Cloudflare Quick Tunnel for this SSE endpoint.

### 2. Configure Vercel

Import the repository into a Vercel project. Select the Vite framework and root directory **apps/web**. Enable access to source files outside the root directory, so the workspace shared package is included. Use:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output directory: `dist`
- Node.js: 24.x
- Environment: `VITE_API_URL=https://YOUR-NGROK-DOMAIN.ngrok-free.dev`

The app's `vercel.json` supplies build/output settings. Vercel's [monorepo documentation](https://vercel.com/docs/monorepos) explains project roots and workspace dependencies. The token belongs only in the local backend environment, never in Vercel.

Set backend `ALLOWED_ORIGINS` to the exact deployed origin, for example `https://panky.vercel.app`, then restart the backend. For both local and deployed use, list both origins separated by commas. Preview deployment origins must be individually authorized; wildcards are not supported. Deploy only when you intend to publish the frontend.

### 3. Verify the deployed path

On the deployed frontend, connect with your token and send a message. Confirm text appears progressively, then refresh and reconnect to verify history. Stop and restart the backend and check the same history again. In browser developer tools, check that a request without `Authorization` receives 401; an unlisted frontend origin should fail access. Open a second tab and attempt a submission during a response: it must be rejected cleanly. Disconnect during a reply and verify an interrupted record after reconnecting. Inspect the network response for `text/event-stream` and incremental data.

Repeat these checks when changing the deployment, tunnel, or backend configuration. A successful local build alone does not verify remote access.

## Milestone status and limits

Milestone 1 is complete. The deployed frontend is https://panky.vercel.app, backed by the Mac through an authenticated ngrok HTTPS tunnel. It includes streaming mock chat, SQLite history, responsive UI, and workspace checks. Local verification passed on Node 26.13.0: `pnpm check` (13 backend tests), `pnpm build`, and `pnpm test:e2e` (5 Chromium tests). Desktop and 390px mobile screenshots were inspected. The compiled backend also streamed a reply and restored it after an actual process restart. The maximum-length browser test completed in about 13 seconds. Independent review found no remaining actionable issues after the long-message streaming fix.

Verification on 1 November 2026: [GitHub CI passed on Node 24](https://github.com/j4ckwinter/panky/actions/runs/41298241985). The live Vercel frontend returns HTTP 200 and its production bundle contains the configured ngrok API URL. Remote checks using the deployed origin verified CORS preflight, rejection of missing authentication and unlisted origins, incremental SSE delivery, and exact saved reply content. The owner confirmed in the deployed browser that replies stream and conversation history survives refresh and reconnection. Remote browser automation was unavailable; concurrency, interruption recovery, mobile layout, and backend restart persistence were exercised by the local checks described above.

The Mac, backend, and ngrok agent must remain running for remote chat to work. This setup is not an always-on hosted backend. The local Git repository includes `pnpm-lock.yaml`; environment secrets, conversation data, and generated files are ignored.

Milestone 2 is implemented with a real clock tool, bounded execution, persisted activity, and cancellation. Verification passed on Node 26.13.0: `pnpm check` (29 backend tests), `pnpm build`, and `pnpm test:e2e` (7 Chromium tests). Desktop and 390px mobile screenshots were inspected. Independent review found no remaining actionable issues. All Milestone 2 verification used isolated test databases. The mock does not reason or call an AI service; the backend executes only the allowed clock tool. There is no Ollama installation or model download. The next milestone is **Local AI on the Windows PC**, which requires that PC to be available and has not been started.
