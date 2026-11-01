# Panky

Milestone 3: local Ollama on the Windows PC, bounded tool execution and persisted activity. TypeScript, pnpm workspaces, React/Vite, Node and SQLite.

- `apps/web`: UI and authenticated API client. Use Pancake UI components and tokens.
- `apps/server`: HTTP boundaries, chat orchestration, provider and SQLite persistence, kept separate.
- `packages/shared`: runtime API schemas and derived types. No server or UI imports.

Use Node 24+ and `pnpm install --frozen-lockfile`. `pnpm dev` starts both apps; `pnpm build` builds them. `pnpm check` runs lint, formatting, typechecking and backend tests. `pnpm test:e2e` exercises real browser/backend behavior. Run checks and build for implementation changes, plus browser tests when changing UI or API contracts. `pnpm format` formats source.

Validate untrusted input and configuration. All conversation and streaming endpoints require bearer authentication independently of CORS. Never put tokens in frontend environment variables, URLs, logs or persistent browser storage. Bind the server to loopback by default. Keep explicit origin allowlists. Never automatically retry message submissions. Preserve interrupted state and enforce one active response globally. Use isolated test databases; never create test conversations in the live database. Keep Ollama on loopback and use local models only. Do not implement Milestone 4 or later. Do not deploy or provision external services without explicit authorization.
