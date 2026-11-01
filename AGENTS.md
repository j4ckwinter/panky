# Panky

Milestone 1 only. TypeScript, pnpm workspaces, React/Vite, Node and SQLite.

- `apps/web`: UI and authenticated API client. Use Pancake UI components and tokens.
- `apps/server`: HTTP boundaries, chat orchestration, provider and SQLite persistence, kept separate.
- `packages/shared`: runtime API schemas and derived types. No server or UI imports.

Use Node 24+ and `pnpm install --frozen-lockfile`. `pnpm dev` starts both apps; `pnpm build` builds them. `pnpm check` runs lint, formatting, typechecking and backend tests. `pnpm test:e2e` exercises real browser/backend behavior. Run checks and build for implementation changes, plus browser tests when changing UI or API contracts. `pnpm format` formats source.

Validate untrusted input and configuration. All conversation and streaming endpoints require bearer authentication independently of CORS. Never put tokens in frontend environment variables, URLs, logs or persistent browser storage. Bind the server to loopback by default. Keep explicit origin allowlists. Never automatically retry message submissions. Preserve interrupted state and enforce one active response globally. Do not install AI runtimes or implement later milestones. Do not deploy or provision external services without explicit authorization.
