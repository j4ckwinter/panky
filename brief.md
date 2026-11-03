# Panky connections

Status: C-1 and C-2 implemented and locally verified, 3 November 2026. C-3 and C-4 remain proposed.

## Outcome

Each signed-in user can connect their own Notion workspace, import selected pages and use them in typed interview answers. Users share the local Ollama model; each request retrieves only the requesting user's sources. Documents are evidence, not model training data.

The owner and an invited friend should complete the same flow independently. Imported copies are stored and processed on the Windows PC hosting Panky. Explain this before connecting: account isolation does not make content inaccessible to the machine's operator.

The user authorized C-1 and subsequently C-2 implementation and verification on 3 November 2026, including improvements consistent with existing processes and styling. Work through later milestones only when requested, record evidence and review the outcome before continuing. This does not authorize external provisioning, deployment, model training or later audio features. Existing authentication, user isolation and local-model safeguards remain in force.

## Current baseline

- [ChatSidebar](apps/web/src/chat/ChatSidebar.tsx) contains Chats and Interview navigation, including collapsed and mobile states.
- [ExperienceSources](apps/web/src/chat/ExperienceSources.tsx) puts import, inspect, refresh and remove controls inside Interview.
- [ExperienceApi](apps/server/src/experience/http.ts) permits imports only through the owner's server `NOTION_TOKEN`. Invited users must never use that credential.
- [ExperienceStore](apps/server/src/experience/store.ts) already scopes sources and SQLite FTS5 retrieval to a user. Preserve those guarantees when introducing connections.
- [Notion experience documentation](docs/notion-experience.md) records supported content, traversal limits, partial-import warnings, failed-refresh behavior and retained evidence snapshots.
- The user reports no personal Notion imports yet. Existing code and synthetic tests do not establish live connection success or retrieval quality.

## Intended interface

Add **Connections** beside Chats and Interview in the left feature rail, using a plug icon, accessible label, tooltip and selected state. Open a dedicated page built with Pancake UI components and tokens. Expose the same destination in the mobile menu. Show only Notion initially.

The Notion card starts with an explanation and **Connect Notion**. After authorization, show the connected workspace and **Choose pages**. Connection grants access; import creates local copies. Keep these separate steps.

Imported pages show their title, Notion link, import timestamp, readiness and warnings. Provide **Add pages**, **Inspect passages**, **Refresh**, **Remove** and **Refresh all**. Distinguish disconnected, connecting, connected with no pages, importing, ready, partial import, failed refresh and reconnect-required states.

Move source management out of Interview once Connections can replace it. Typed Interview keeps a compact **Use my sources** control, a usable-page count and **Manage sources** link. Preserve pasted experience samples and evidence excerpts beneath answers.

## Scope and proposed defaults

- One Notion workspace connection per Panky account initially. Switching workspaces requires disconnecting and removing the previous imported corpus.
- Use Notion OAuth with read-only content capabilities. Keep credentials on the backend; encrypt persisted user tokens and document host key configuration. Never expose secrets in frontend configuration, browser storage, responses or logs.
- Import only explicitly selected pages. Granting access to a parent in Notion does not automatically import its children into Panky. Preserve existing supported-content limits and explain omissions.
- Refresh is manual. Refresh all processes a bounded list of the user's sources and reports individual failures. No background synchronization or automatic import retries.
- Disconnect stops connection work, removes credentials and deletes its imported sources and search index. Existing conversations and evidence snapshots remain. Explain this before confirmation. Late callbacks or imports must not restore disconnected state.
- Access revocation is not instantly detectable without synchronization. Display import timestamps. A detected authorization failure requires reconnecting and excludes affected content from new answers until access is revalidated. Preserve the existing exclusion of failed-refresh sources from retrieval.
- Keep ordinary chat unchanged. The current IA-5 speech-derived question flow remains general knowledge only, without personal-source or microphone-context enrichment.
- Keep Ollama on Windows and loopback. Fine-tuning, cloud-model fallback, vector services, other connectors, Notion writes and a general plugin framework are outside this track.

## C-1 — Connect an individual account

Status: implemented and locally verified. Live Notion setup and authorization remain unverified.

Implementation decisions:

- Keep the existing strict session cookie. A minimal callback page removes the authorization query and completes the exchange through a same-origin authenticated request; state remains bound to the initiating account and session.
- Derive the callback from `AUTH_ORIGIN` and the fixed API path, using the existing frontend proxy instead of introducing another redirect setting.
- Preserve the one-workspace default. C-1 disconnect deletes OAuth credentials and invalidates in-flight work but leaves the separate legacy owner imports and existing conversations unchanged. C-2 will add removal of sources attached to OAuth connections.
- Show connection status without unfinished page-import controls. C-1 does not alter retrieval or answers.
- Persist encrypted tokens, rotate them on explicit connection checks, and retain them after definite temporary HTTP failures. An unusable or ambiguous refresh result requires reconnection.

**Outcome:** an owner or invited user links their own workspace from Connections and sees its status after signing in again.

Scope:

- Add the rail destination and connection states without exposing incomplete page-import controls.
- Add OAuth start/callback, connection persistence and status APIs using shared runtime schemas. Bind short-lived, single-use OAuth state to the initiating signed-in account. Reject expired, mismatched and replayed callbacks. OAuth callbacks need state validation rather than relying on a browser Origin header.
- Implement the token lifecycle required by the current Notion API, including refresh failures. Redact transient authorization codes from request logs as well as tokens.
- Include disconnect in the first usable version. Establish ownership and cancellation rules before attaching imports in C-2.
- Preserve the owner-only internal connection until an explicit migration; never fall back to it for invited users.

Completion checks:

- [x] Mock OAuth browser tests cover connect, denial, callback failure, return navigation and reconnect messaging on desktop and mobile.
- [x] Backend tests prove callback account binding, replay rejection, restart persistence and token secrecy.
- [x] Account A cannot read, replace or disconnect account B's connection by supplying B's identifiers.
- [x] Disconnect invalidates in-flight connection work; late callbacks cannot silently reconnect the account.
- [x] OAuth setup requirements are documented separately from completed external setup. Mocked tests are not reported as live authorization.

Verification on 3 November 2026:

- `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm build` passed. The check includes 116 backend tests. The build retains the existing non-blocking bundle-size warning.
- The full `pnpm test:e2e` run passed 98 of 100 tests. Two existing clipboard assertions failed because Windows returns CRLF line endings. Those assertions now normalize only CRLF; both passed on a focused rerun alongside all five Connections tests, seven passing tests total. No application copy behavior changed.
- Browser tests exercise a synthetic external Notion authorization page followed by the real callback and completion endpoints. Full request headers verify that the strict session cookie is absent on the external return and present on same-origin completion. Tests also cover two independent accounts, reconnect, status failure recovery and keyboard-accessible disconnect confirmation.
- Desktop, collapsed-rail and mobile screenshots were inspected. Current previews are in `test-results/connections-{disconnected,connected,mobile}.png`; subsequent browser runs may overwrite them.
- Independent review found that temporary refresh failures could discard valid credentials. The fix preserves them on definite temporary HTTP failures; provider/service tests cover 401 followed by 429/503 and a successful manual retry. The final production and test review had no remaining findings.
- No live Notion authorization, personal imports, deployment or external provisioning was performed. Host configuration is documented in [Notion connections](docs/notion-connections.md). C-2 had not started at that checkpoint.

## C-2 — Choose and manage personal pages

Status: implemented and locally verified. Live Notion authorization and personal imports remain unverified.

**Outcome:** each account imports and manages pages through its own connection in Connections.

Scope:

- Add a bounded, paginated picker for pages available to the connection, with search, selection and explicit import. Explain discovery and permission limits; retain page-link entry if useful.
- Resolve credentials from the authenticated account and connection. Client-supplied user IDs and knowledge of source IDs never grant access.
- Reuse bounded imports and per-user storage. Associate sources with their connection so disconnect and workspace replacement have precise effects.
- Support inspect, refresh, remove and bounded refresh-all with progress and per-page errors. Failed refresh retains an inspectable old copy but excludes it from new retrieval.
- Complete disconnect cleanup, including canceling imports/refreshes and preventing late writes after disconnect or workspace replacement.
- Migrate the owner's internal connection deliberately. Do not silently assign old sources to a new workspace: re-import through OAuth or explicitly revalidate access. Remove the old path only after callers and setup instructions are migrated.

Completion checks:

- [x] Two isolated accounts import different pages, including separate copies of the same page ID, without sharing sources or credentials.
- [x] Forged identifiers cannot inspect, refresh, remove or import through another user's access.
- [x] Partial content, inaccessible pages, rate limits, timeouts and interrupted imports have actionable states and retain existing bounds.
- [x] Disconnect during import or refresh prevents sources from reappearing, including after restart.
- [x] Refresh-all reports mixed results; source removal updates counts and the search index.
- [x] Existing conversations and evidence snapshots survive removal, disconnect and owner migration as disclosed in the UI.

Implementation decisions and verification on 3 November 2026:

- Added title search with 20 results per request, explicit selection and page-link entry. Search is not a complete inventory; the picker explains permission/indexing limits and separate child-page imports.
- Imports and refresh-all process a bounded list sequentially in the browser, with per-page progress and results. Each server operation retains the existing traversal, size and timeout bounds; work is never retried automatically. Leaving Connections cancels remaining browser batch work.
- Added a stable connection identifier independently of OAuth attempt revisions. Sources carry that identifier. Disconnect cancels operations and removes only attached sources/index entries; late writes are rejected. Known authorization failures exclude the attached corpus until individual pages are refreshed successfully, including across reconnect/restart.
- Legacy sources remain unassigned. Successful explicit OAuth re-import validates access before migrating a page, preserving its source ID and saved evidence. Legacy and OAuth work share exclusion gates so concurrent migration cannot restore a removed source. The old importer remains for existing callers; its removal and the Interview management transition are deferred to C-3.
- Inspected the configured local database read-only: its experience table contained zero sources. No live data was changed, and this observation does not establish the Windows host's corpus. A synthetic pre-C-2 database migration test preserves encrypted C-1 tokens, legacy passages, timestamps and search results across reopening.
- `pnpm install --frozen-lockfile`, `pnpm check` (131 backend tests) and `pnpm build` passed. The existing non-blocking bundle-size warning remains.
- All five new page-management browser tests passed on the focused run. They exercise account-specific credentials/copies, forged source IDs, search/pagination/manual entry, mixed refresh results, disconnect during import and source-status updates after a failed connection check. Desktop and mobile screenshots were inspected.
- Independent read-only review of the final production changes and migration test found no actionable findings. Backend tests also verify exact saved conversation/evidence retention through migration, removal, disconnect and restart.
- The full `pnpm test:e2e` regression run passed all 106 tests in 7.6 minutes, including existing chat, legacy imports, audio and authentication flows. Screenshots are in `test-results/connection-pages-{desktop,mobile}.png` and may be overwritten by subsequent runs.
- No external provisioning, deployment, real Notion import or live model evaluation was performed. C-3 and C-4 have not started.

## C-3 — Use sources in typed interviews

Status: not started. Depends on C-2.

**Outcome:** typed interview questions use the current user's ready sources without putting connection management in the interview form.

Scope:

- Replace the old management panel with source status, **Use my sources** and **Manage sources**. Preserve drafts when navigating to Connections and back.
- Make the control's effect on imported sources explicit; retain the separate pasted-sample input and existing context-budget checks.
- Enforce source selection on the backend. Disabling imported sources omits them from model input, not just the citation display.
- Preserve exact evidence snapshots, titles, timestamps and links. Imported content remains untrusted evidence, never instructions or tool authorization.
- Preserve pending-response behavior, interrupted-state handling and the global single-response limit.

Completion checks:

- [ ] Browser tests cover no connection, zero usable pages, sources on/off, management navigation and persisted evidence.
- [ ] Backend tests inspect model inputs to prove only the requesting user's eligible sources are included, and none when disabled.
- [ ] Ordinary chat and the current speech-derived question path remain unchanged and receive no imported personal material.
- [ ] Missing evidence yields an explicit gap or general guidance rather than invented personal experience.
- [ ] Desktop, collapsed-rail and mobile flows have keyboard access, visible focus and usable layouts.

## C-4 — Verify the complete flow with two users

Status: not started. Depends on C-3.

**Outcome:** the owner and an invited user independently connect real workspaces and receive useful, sourced answers from the PC's model.

Scope:

- With explicit authorization for external setup and personal imports, verify real OAuth through the deployed frontend and PC backend. Distinguish local verification from deployed verification.
- Use a small selected corpus per account and 15–20 representative questions overall. Include paraphrases, unsupported questions and attempts to request another account's information.
- Identify expected passages before testing. Evaluate retrieval separately from factual support, usefulness and latency. Include questions that distinguish personal contributions from team outcomes.
- Start with existing SQLite retrieval. Record failures and propose a measured follow-up if needed; embeddings or model changes are not automatic additions to this milestone.
- Document operation, manual refresh, access loss, disconnect, host storage and evidence retention. Keep README updates concise and consistent with its voice.

Completion checks:

- [ ] Each user completes connect, import, inspect, ask, edit in Notion, refresh and remove using their own account.
- [ ] Live access loss and reconnect work without retaining retrieval access to content known to be inaccessible.
- [ ] No cross-account sources appear in responses, model inputs or saved evidence, including when explicitly requested.
- [ ] Disconnect removes the account's imported corpus and prevents future retrieval; conversation retention matches the warning.
- [ ] Quality and latency targets are agreed before evaluation. Question-level results record failures as well as successes; successful transport alone does not establish acceptance.
- [ ] Both users review the experience and remaining limitations before the track is marked complete.

## Verification and decisions before implementation

For code milestones, use Node 24+, install with `pnpm install --frozen-lockfile` when needed, and run `pnpm check` and `pnpm build`. Run `pnpm test:e2e` for UI and API contract changes. Automated tests use isolated databases and synthetic Notion responses, never live conversations. Account/token boundaries, migrations and disconnect races require independent review under the Pancake workflow. Record evidence and remaining gaps per milestone.

For C-1, the one-workspace default and staged disconnect behavior were adopted using the user's authorization to resolve inconsistencies. The callback is derived from `AUTH_ORIGIN`; current official Notion OAuth/token requirements were checked during implementation. Creating the integration or changing deployed settings still requires separate authorization. Keep secrets out of this document. Before C-2 owner migration, inspect actual stored sources; the report of no imports does not replace safe migration checks.

Repository instructions now record C-1 and C-2 authorization without linking to the removed interview plan. This brief does not expand the permitted IA-5 scope or mark earlier live acceptance checks complete.

Reference: [Notion authorization](https://developers.notion.com/guides/authorization/overview).
