# Panky

A personal chat workspace. Select a deterministic mock provider or a local Ollama model on the Windows PC. Both use the same bounded task loop and one real tool: reading the current date and time.

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
| `MODEL_PROVIDER`       | `mock` or `ollama`; unsupported providers fail startup                                                  |
| `MODEL_NAME`           | `panky-mock`                                                                                            |
| `MODEL_ENDPOINT`       | `http://127.0.0.1:11434`; numeric loopback HTTP origin only, unused in mock mode                        |
| `MODEL_CONTEXT_LENGTH` | `4096` tokens; allowed range 2048–8192, separate from the history character budget                      |
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

`HISTORY_MAX_CHARS` limits the message text passed to the provider. This is a character budget, not a model token budget. It does not delete stored history. Older content can be omitted, so a model may not see earlier instructions; activity records how much history was included and how many messages were omitted. New tool results and intermediate assistant text also count toward this budget; exceeding it stops the task with a recorded failure. Short-context real-model recall was verified in Milestone 3. Longer or multilingual conversations can still exceed the token window and need separate evaluation.

Existing Milestone 1 databases receive additive task/activity tables at startup. Existing messages are retained and do not get invented historical tool activity. The new web client opts into activity events with `includeActivity: true`; older clients retain the text stream contract. Update backend code before deploying the new frontend. Back up the database before upgrading and run only one backend process against it.

Tests use isolated in-memory or temporary SQLite databases. Do not run verification prompts against the live database; they create persistent conversations visible on login.

## Original Mac remote-access setup

This section records the original Milestone 1 setup; the current PC setup is documented below. The frontend runs on Vercel and the backend originally ran on the Mac. Both the backend and the tunnel must remain running, and the Mac must stay awake and connected. You need Vercel and ngrok accounts; no purchased domain is required.

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

Milestone 1 is complete. The Milestone 1 deployment used https://panky.vercel.app, backed by the Mac through an authenticated ngrok HTTPS tunnel. It includes streaming mock chat, SQLite history, responsive UI, and workspace checks. Local verification passed on Node 26.13.0: `pnpm check` (13 backend tests), `pnpm build`, and `pnpm test:e2e` (5 Chromium tests). Desktop and 390px mobile screenshots were inspected. The compiled backend also streamed a reply and restored it after an actual process restart. The maximum-length browser test completed in about 13 seconds. Independent review found no remaining actionable issues after the long-message streaming fix.

Verification on 1 November 2026: [GitHub CI passed on Node 24](https://github.com/j4ckwinter/panky/actions/runs/41298241985). The live Vercel frontend returns HTTP 200 and its production bundle contains the configured ngrok API URL. Remote checks using the deployed origin verified CORS preflight, rejection of missing authentication and unlisted origins, incremental SSE delivery, and exact saved reply content. The owner confirmed in the deployed browser that replies stream and conversation history survives refresh and reconnection. Remote browser automation was unavailable; concurrency, interruption recovery, mobile layout, and backend restart persistence were exercised by the local checks described above.

The backend host, backend process, and ngrok agent must remain running for remote chat to work. This setup is not an always-on hosted backend. The local Git repository includes `pnpm-lock.yaml`; environment secrets, conversation data, and generated files are ignored.

Milestone 2 is implemented with a real clock tool, bounded execution, persisted activity, and cancellation. Verification passed on Node 26.13.0: `pnpm check` (29 backend tests), `pnpm build`, and `pnpm test:e2e` (7 Chromium tests). Desktop and 390px mobile screenshots were inspected. Independent review found no remaining actionable issues. All Milestone 2 verification used isolated test databases. The mock does not reason or call an AI service; the backend executes only the allowed clock tool. Milestone 2 did not require Ollama or a model download. Milestone 3 is complete on the Windows PC; see the setup and verification notes below.

## Windows local AI setup (Milestone 3)

Install [Ollama for Windows](https://docs.ollama.com/windows), then open a new PowerShell terminal. Keep Ollama bound to `127.0.0.1:11434`. Set `OLLAMA_NO_CLOUD=1` and `OLLAMA_GO_TEMPLATE=1` in its process environment or user environment before restarting Ollama. The first keeps inference local; the second makes Ollama 0.40.13 apply the corrected Go template below. Quit an existing Ollama tray instance before starting a replacement server. Do not expose port 11434 through the tunnel or add browser origins to Ollama. Panky alone calls its [native chat API](https://docs.ollama.com/api/chat).

To preserve the runtime settings for future launches, run these once, then quit and relaunch Ollama:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_NO_CLOUD", "1", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_GO_TEMPLATE", "1", "User")
```

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
# If pnpm is not on PATH, create project-local command shims:
corepack enable --install-directory node_modules/.bin
if (!(Test-Path apps/server/.env)) { Copy-Item apps/server/.env.example apps/server/.env }
if (!(Test-Path apps/web/.env)) { Copy-Item apps/web/.env.example apps/web/.env }
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama create panky-qwen3:4b -f models/qwen3.Modelfile
```

Generate a token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in your own terminal and save it as `AUTH_TOKEN` in `apps/server/.env`. Set these backend values:

```dotenv
MODEL_PROVIDER=ollama
MODEL_NAME=panky-qwen3:4b
MODEL_ENDPOINT=http://127.0.0.1:11434
MODEL_CONTEXT_LENGTH=4096
HISTORY_MAX_CHARS=8000
MAX_TASK_DURATION_MS=120000
```

Run `corepack pnpm dev`, connect at http://localhost:5173, and check that the sidebar displays `Local AI` and the configured model. Send `What is the current date and time?` and inspect Task activity for the actual tool result. Mock mode remains available with `MODEL_PROVIDER=mock` and `MODEL_NAME=panky-mock`.

The selected model is a local variant of Qwen3 4B Instruct 2507, using the corrected template in `models/qwen3.Modelfile`. The inspected PC has an RTX 3080 with 10 GB VRAM. [qwen3:4b-instruct-2507-q4_K_M](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M) is a 2.5 GB model with tool support. Avoid the generic `qwen3:4b` tag: it resolved to the thinking-only variant during evaluation. The custom template serializes tool definitions and call arguments as JSON to work around [Ollama issue 14601](https://github.com/ollama/ollama/issues/14601). It reuses the downloaded weights. The provider disables thinking, starts with 4096 context tokens, and does not retry. Only one tool request per model turn is supported. Multiple requests fail before executing a tool. Missing models, connection errors, malformed responses and tool failures appear in task activity. A failed tool ends the task; automatic recovery within that task is not implemented. A later user message may ask the model to try again.

The history budget counts characters, not tokens, and cannot guarantee fit in the model context. Ollama can truncate context; keep prompts short and check retention with representative conversations. Historical tool records remain in activity; later tasks receive completed user/assistant text, while structured tool calls and results are supplied during the current task. GPU residency can be checked with `ollama ps` and `nvidia-smi`; do not infer it from a successful reply. See the [Ollama FAQ](https://docs.ollama.com/faq).

### Move saved conversations from the Mac

Stop Panky on both machines. Back up the Mac's `apps/server/data` directory, including SQLite sidecar files, and securely copy the complete directory to `apps/server/data` on the PC. Back up any existing PC data first; do not overwrite it or merge databases implicitly. Set `DATABASE_PATH=./data/panky.sqlite`, then start one backend process. Existing task/activity tables remain compatible. Re-enter your backend token after browser refresh. Transfer configuration privately or generate a new token, and retain the exact frontend origin allowlist.

### Remote access from the PC

The deployed frontend at https://panky.vercel.app now includes Milestone 3 and uses the PC backend through the existing ngrok hostname. Stop the Mac's ngrok tunnel before starting the PC tunnel: only one machine should serve this hostname and conversation database.

Ngrok is installed through the Microsoft Store on Windows. Configure its account token privately, then use **PowerShell** to start it (the Store executable alias did not launch from Git Bash):

```powershell
ngrok http http://127.0.0.1:3001 --url=https://upcountry-scheme-excretory.ngrok-free.dev --inspect=false
```

Keep this terminal and the Panky backend running, and keep the PC awake and connected. Ollama stays on loopback port 11434; only Panky's authenticated API is tunneled. Keep `ALLOWED_ORIGINS` set to the exact Vercel frontend origin plus any required local development origins. The Panky access token is stored only in the ignored backend environment file and must be re-entered after browser refresh. It is separate from the ngrok account token.

Remote API verification on 1 November 2026 confirmed the public hostname reaches the PC's `ollama` provider with `panky-qwen3:4b`: authenticated health returned 200, missing authentication returned 401, an unlisted origin returned 403, and the deployed origin's preflight returned 204. The updated production frontend and GitHub CI passed for commit `f44a9bc`. No automated verification conversations were created in the live database. The owner confirmed that the deployed browser streams real-model replies, shows clock-tool activity, and restores the conversation after refresh and reconnection.

### Develop on the MacBook while the PC serves Panky

Push committed code from one machine and pull it on the other. Keep each machine's ignored environment files and databases separate; Git does not transfer them. For UI work on the Mac, set `apps/web/.env` to `VITE_API_URL=https://upcountry-scheme-excretory.ngrok-free.dev`, run the web app, and enter the PC backend's current token in the UI. The PC allowlist includes `http://localhost:5173` and `http://127.0.0.1:5173`. This uses the PC's live conversations and model; use a separate local mock backend and isolated database for automated tests. Backend changes must be pulled, built and restarted on the PC before they affect the remote app. Keep the Mac's old ngrok tunnel stopped.

### Repeat the real-model evaluation

After installing the model, run `corepack pnpm evaluate:ollama --run`. This opt-in command starts an ephemeral backend with an isolated in-memory database and prints JSON measurements. It checks exact instruction following, conversation recall, two clock-tool runs, an injected tool failure, and a user-requested retry. It reports first-text and total latency, exact stored output, tool results, Ollama version and GPU residency metadata. A failed assertion exits nonzero; these few examples do not establish general model reliability.

### Measured local-model results

On 1 November 2026, Ollama 0.40.13 with `panky-qwen3:4b` passed all seven real-model evaluation cases through Panky's authenticated HTTP API and an isolated in-memory database. The alias uses Qwen3 4B Instruct 2507 Q4_K_M, a 4096-token context and an 8000-character history budget. Exact instruction following, history recall, both clock-tool results, visible tool failure and an explicit user retry all passed. Stored output matched the streamed output in every case.

The first reply after loading took 2355 ms, with its first text at 2324 ms. Warm text cases completed in 55 to 94 ms. Clock-tool runs completed in 301 to 318 ms; the retry after an injected tool failure completed in 324 ms. These are short prompts from one evaluation run, not throughput or long-context benchmarks. `ollama ps` reported 100% GPU residency and 3.2 GB for the model; `nvidia-smi` reported 4198 MiB total GPU memory use out of 10240 MiB.

The generic `qwen3:4b` tag resolved to Thinking 2507 and failed the initial evaluation. Its stock template also rendered malformed tool definitions. The explicit Instruct variant plus the corrected template and Go-template runtime setting passed the same acceptance checks. Do not substitute the generic tag or remove the compatibility setting without repeating the evaluation.

Verification passed on Node 24.20.0: `pnpm check` with 46 backend tests, `pnpm build`, and `pnpm test:e2e` with 19 Chromium tests. A separate real-model browser check verified the provider label, clock activity and cancellation after streamed text began. Desktop and 390px mobile screenshots were inspected. All verification used isolated databases.

Milestone 3 is complete. Local real-model evaluation, remote authentication and CORS checks, and owner verification of deployed streaming, clock activity and restored history all passed. Milestone 4 has not started.
