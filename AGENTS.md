# Panky

Milestone 3 baseline: local Ollama on the Windows PC, bounded tool execution and persisted activity. IA-1 through IA-3 in `interview-assistant-plan.md` are authorized: typed interview assistance, selected Notion imports, sourced experience retrieval and bounded conversational follow-ups. TypeScript, pnpm workspaces, React/Vite, Node and SQLite.

- `apps/web`: UI and authenticated API client. Use Pancake UI components and tokens.
- `apps/server`: HTTP boundaries, chat orchestration, provider and SQLite persistence, kept separate.
- `packages/shared`: runtime API schemas and derived types. No server or UI imports.

Keep related code together: web features live in `src/chat` and `src/auth`, reusable UI in `src/components`, and shared API client code in `src/api`. Server authentication, chat execution and model providers have separate folders. Colocate backend tests with the code they exercise.

Give modules one clear responsibility. Treat files approaching 300 lines as a review trigger, not a hard limit. Extract cohesive behaviour and consolidate repeated rules; do not split state that must change together or add abstractions just to reduce line counts. Keep component styles together and avoid adding later overrides for rules that can be updated at their source. Refactors must preserve behaviour and appearance, with baseline and post-change verification.

Use Node 24+ and `pnpm install --frozen-lockfile`. `pnpm dev` starts both apps; `pnpm build` builds them. `pnpm check` runs lint, formatting, typechecking and backend tests. `pnpm test:e2e` exercises real browser/backend behavior. Run checks and build for implementation changes, plus browser tests when changing UI or API contracts. `pnpm format` formats source.

Validate untrusted input and configuration. All conversation and streaming endpoints require authentication independently of CORS: bearer credentials for API clients or a valid server-side session for browsers. Cookie-authenticated writes require the configured exact origin. Google sign-in is invite-only; scope conversations, messages, task cancellation, experience sources and sessions to the authenticated user. The configured bearer token maps only to the owner. The server's Notion integration belongs only to the owner; other users must never use its credentials. Never put tokens in frontend environment variables, URLs, logs or persistent browser storage. Bind the server to loopback by default. Keep explicit origin allowlists. Never automatically retry message submissions. Preserve interrupted state and enforce one active response globally. Use isolated test databases; never create test conversations in the live database. Keep Ollama on loopback and use local models only. Do not implement IA-4 or later, or other Milestone 4+ work, without explicit authorization. Do not deploy or provision external services without explicit authorization.
