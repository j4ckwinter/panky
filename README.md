# panky

i spent a fortune on my graphics card, so i figured i should make it useful. i'm building a little AI teammate that runs on my PC and comes with me on my phone.

it's called Panky. the model runs locally through Ollama, the chats stay on the PC, and the interface uses [Pancake UI](https://github.com/j4ckwinter/pancake-ui). mostly, it's an excuse to see how useful i can make this thing.

## try it out

use Node 24+ and pnpm 12.16.1. from this checkout:

```sh
pnpm install --frozen-lockfile
cp -n apps/server/.env.example apps/server/.env
cp -n apps/web/.env.example apps/web/.env
```

generate a token and save it as `AUTH_TOKEN` in `apps/server/.env`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

set up Google sign-in below, then start both apps:

```sh
pnpm dev
```

open **http://localhost:5173**. this uses a mock model, so you can work on the app without installing Ollama. replies are scripted, but saving chats and calling the clock tool are real.

<details>
<summary>Google sign-in</summary>

create a [Google OAuth web client](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). add `http://localhost:5173` and your deployed frontend URL as Authorized JavaScript origins. the current deployment is `https://panky.vercel.app`.

set these in `apps/server/.env` and restart the backend:

```dotenv
OWNER_EMAIL=your-email@gmail.com
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
AUTH_ORIGIN=http://localhost:5173
```

no client secret or redirect URI is needed. if Google's app is in testing, add the accounts as Google test users too. without a client ID, browser sign-in is disabled.

keep `PANKY_API_TARGET=http://127.0.0.1:3001` in `apps/web/.env`. local and production databases are separate; don't change the PC's production origin to develop on the Mac.

`AUTH_TOKEN` is a private owner credential for API clients, not browser login. never put it in frontend configuration or share it with friends. changing an established owner email fails startup rather than transferring ownership.

</details>

## use it

sign in with Google and start a chat. to try the tool:

> What is the current date and time?

open **Used 1 tool** beneath the reply to see what actually ran. the mock recognises that exact prompt; with Ollama, the model decides when to call the tool. **Stop response** stops a reply. saved chats are in the sidebar, and a refresh opens a fresh chat without signing you out.

only the owner can add people through **Account → People**. this allows their Google account; it doesn't send an email, so share the link yourself. friends get private chats and can't invite others. removing access ends their sessions. **Account → Sessions** lets each person sign out their own devices. sessions last 30 days; Gmail and Google Workspace accounts are supported.

chat and the clock tool work today. next is one useful workflow, before adding more tools. there's no shell access or background automation yet. the [brief](brief.md) has the roadmap.

## run it on your PC

the current setup uses an RTX 3080, Ollama and a small Qwen3 model. the frontend runs on Vercel and reaches the PC through an HTTPS tunnel. the PC needs to stay awake and connected.

<details>
<summary>Windows and Ollama setup</summary>

install [Ollama for Windows](https://docs.ollama.com/windows). keep it on `127.0.0.1:11434`. in PowerShell, set these once, then quit and relaunch Ollama:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_NO_CLOUD", "1", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_GO_TEMPLATE", "1", "User")
```

the first setting keeps inference local. the second enables the corrected model template used with the evaluated Ollama version, 0.40.13.

from the repository root:

```powershell
corepack pnpm install --frozen-lockfile
# If pnpm is missing from PATH:
corepack enable --install-directory node_modules/.bin
if (!(Test-Path apps/server/.env)) { Copy-Item apps/server/.env.example apps/server/.env }
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama create panky-qwen3:4b -f models/qwen3.Modelfile
```

configure the token and Google sign-in as above, then set these in `apps/server/.env`:

```dotenv
MODEL_PROVIDER=ollama
MODEL_NAME=panky-qwen3:4b
MODEL_ENDPOINT=http://127.0.0.1:11434
MODEL_CONTEXT_LENGTH=4096
HISTORY_MAX_CHARS=8000
MAX_TASK_DURATION_MS=120000
```

build and start the backend:

```powershell
corepack pnpm build
corepack pnpm --filter @panky/server start
```

the model uses the template in [models/qwen3.Modelfile](models/qwen3.Modelfile) to address malformed tool definitions in [Ollama issue 14601](https://github.com/ollama/ollama/issues/14601). use the explicit Instruct model above: the generic `qwen3:4b` tag resolved to a thinking variant that failed evaluation. repeat the evaluation before changing the model or removing the template setting.

</details>

<details>
<summary>Vercel and the tunnel</summary>

the deployed path is:

```text
Browser → Vercel /api proxy → HTTPS tunnel → PC backend → Ollama
```

the PC, backend, Ollama and tunnel must stay running. this isn't an always-on hosted backend.

configure the PC backend:

```dotenv
AUTH_ORIGIN=https://panky.vercel.app
ALLOWED_ORIGINS=https://panky.vercel.app
```

use your own exact frontend origin if hosting elsewhere. cookie-authenticated writes require `AUTH_ORIGIN`; CORS is not authentication.

configure ngrok's account token privately, then start the tunnel in PowerShell:

```powershell
ngrok http http://127.0.0.1:3001 --url=https://upcountry-scheme-excretory.ngrok-free.dev --inspect=false
```

that hostname belongs to the current deployment; replace it for your own setup. `--inspect=false` disables request inspection that could capture credentials and conversations. the ngrok token is separate from Panky's API token. keep the old Mac tunnel stopped, and never expose Ollama's port 11434.

for Vercel, use **apps/web** as the project root, allow access to workspace files outside it, and install with `pnpm install --frozen-lockfile`. [apps/web/vercel.json](apps/web/vercel.json) defines the build, output and `/api` rewrite. update that rewrite when changing tunnels; frontend environment variables do not change the production target. keep secrets on the backend.

to update the PC: stop the backend, back up the database, pull the code, install with the frozen lockfile, build and restart. update the backend before a frontend release that depends on new API behaviour.

after deployment, check Google sign-in, streamed replies, stopping a response and history after refresh. local tests don't prove the Google Cloud configuration or deployed cookie/tunnel path. the owner verified deployed real-model streaming, clock activity and restored history for Milestone 3.

</details>

## work on it

React and Vite live in `apps/web`, grouped into chat, auth and shared components. `apps/server` separates authentication, chat execution and model providers, with tests alongside them. `packages/shared` holds the API schemas and types.

```sh
pnpm check       # lint, formatting, types and backend tests
pnpm build      # build both apps and shared schemas
pnpm test:e2e   # browser tests against an isolated backend
pnpm format     # format source
```

install Chromium once with `pnpm exec playwright install chromium`. individual checks are `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test`. CI runs checks, build and browser tests. the browser tests stub Google sign-in; real sign-in still needs checking after deployment.

use the mock on the Mac and test model changes on the PC. push and pull code between them; environment files and databases stay separate. tests use isolated databases, never your live chats.

<details>
<summary>model checks and known limits</summary>

run `corepack pnpm evaluate:ollama --run` on the PC. it uses an in-memory database to check instructions, short conversation recall, clock calls, tool failure and a requested retry. check GPU use with `ollama ps` and `nvidia-smi`.

on 1 November 2026, all seven cases passed with Ollama 0.40.13 and `panky-qwen3:4b` on the RTX 3080. the first reply took 2.36 seconds; short warm replies took 55–94 ms and clock runs 301–318 ms. Ollama reported 100% GPU residency. these are small examples, not a general reliability benchmark.

- one response runs at a time across all users. Busy submissions are rejected without adding messages.
- disconnecting interrupts generation and preserves partial text. restarting marks unfinished work interrupted. messages and tools are never retried automatically; check history before manually resending after a connection error.
- the provider supports one tool request per turn. tool failures end the task; a later message can request another attempt.
- history is bounded by characters, not tokens. older messages may be omitted, and Ollama may truncate context. stored history isn't deleted. previous tasks supply completed message text; structured tool results are supplied within the current task.
- browser sessions use HttpOnly cookies, Secure on HTTPS. the backend verifies Google identities and enforces per-user access. the owner cannot read members' chats through the app.
- SQLite stores chats in plaintext. keep its directory private and run only one backend process per database.

for backups or moving data between machines, stop the backend and copy the database **with any SQLite sidecar files**. back up the destination first; don't overwrite or merge databases implicitly. the database also contains accounts, invitations and sessions. transfer configuration privately.

legacy chats are assigned to the owner during migration. don't roll back to the old single-user backend after adding members: it lacks ownership checks and could expose their chats.

</details>

## a bit more

[server configuration](apps/server/.env.example) lists the defaults; [config.ts](apps/server/src/config.ts) defines their limits. [web configuration](apps/web/.env.example) sets the local proxy target. the [brief](brief.md) records Milestone 3 as complete and what's next.
