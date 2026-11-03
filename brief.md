# Panky connections

Status: C-1 through C-3 implemented and locally verified, 3 November 2026. C-4 live verification was subsequently reported complete by the user. Later source and Interview UI changes are recorded below and supersede the original typed Interview controls.

## Outcome

Each signed-in user can connect their own Notion workspace, import selected pages and use them in chat and explicitly submitted live Interview answers. Users share the local Ollama model; each request retrieves only the requesting user's sources. Documents are evidence, not model training data.

The owner and an invited friend should complete the same flow independently. Imported copies are stored and processed on the Windows PC hosting Panky. Explain this before connecting: account isolation does not make content inaccessible to the machine's operator.

The user authorized C-1, C-2 and subsequently C-3 implementation and verification on 3 November 2026, including improvements consistent with existing processes and styling. Work through later milestones only when requested, record evidence and review the outcome before continuing. This does not authorize external provisioning, deployment, model training or later audio features. Existing authentication, user isolation and local-model safeguards remain in force.

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
- C-1 through C-3 kept ordinary chat and speech-derived questions unchanged. The subsequently authorized source expansion below adds optional personal sources to both; automatic submission and microphone-context enrichment remain excluded.
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

Status: implemented and locally verified. Live model quality remains unverified.

**Outcome:** typed interview questions use the current user's ready sources without putting connection management in the interview form.

Scope:

- Replace the old management panel with source status, **Use my sources** and **Manage sources**. Preserve drafts when navigating to Connections and back.
- Make the control's effect on imported sources explicit; retain the separate pasted-sample input and existing context-budget checks.
- Enforce source selection on the backend. Disabling imported sources omits them from model input, not just the citation display.
- Preserve exact evidence snapshots, titles, timestamps and links. Imported content remains untrusted evidence, never instructions or tool authorization.
- Preserve pending-response behavior, interrupted-state handling and the global single-response limit.

Completion checks:

- [x] Browser tests cover no connection, zero usable pages, sources on/off, management navigation and persisted evidence.
- [x] Backend tests inspect model inputs to prove only the requesting user's eligible sources are included, and none when disabled.
- [x] Ordinary chat and the current speech-derived question path remain unchanged and receive no imported personal material.
- [x] Missing evidence yields an explicit gap or general guidance rather than invented personal experience.
- [x] Desktop, collapsed-rail and mobile flows have keyboard access, visible focus and usable layouts.

Implementation decisions and verification on 3 November 2026:

- Added **Use my sources**, a usable-page count and **Manage sources** to typed Interview. The shared `useSources` flag defaults to true for existing clients; switching it off removes imported passages from retrieval, model input and new evidence snapshots while keeping the pasted sample separate.
- The backend counts only the requesting user's ready, nonempty legacy sources and sources attached to the current eligible OAuth connection. HTTP retrieval and prompt assembly both exclude imported evidence for speech-derived questions. Ordinary chat remains unchanged.
- Question text, pasted sample, source selection, typed context and spoken-answer notes share an in-memory draft owned above the view switch. Connections visits preserve it and the current conversation. Chats, a new interview, sign-out, reload and OAuth redirects clear it. This milestone does not add browser persistence of personal drafts. Audio capture stops when Interview unmounts and is never restarted automatically.
- Legacy owner management now lives in Connections; existing host credentials and imports are preserved for explicit migration. Independent review found that a successful OAuth migration left the legacy list stale. Source mutations now refresh that list and clear inspected content without collapsing its panel; the reviewer cleared the correction.
- `pnpm install --frozen-lockfile`, `pnpm check` (133 backend tests) and `pnpm build` passed. The existing non-blocking bundle-size warning remains. Model-input tests cover two accounts, failed/empty/obsolete sources, reconnect-required exclusion, source selection independent of pasted samples, missing-evidence guidance, context budgets and exact saved-evidence retention.
- Eleven focused browser tests passed for typed drafts/context, imported-source selection, management navigation, legacy controls and audio release. Desktop and mobile screenshots were inspected. The full `pnpm test:e2e` run passed 110 tests in 7.8 minutes. After the migration-list correction and added regression, all 17 affected Connections, source-management and interview-source tests passed on the final code. Screenshots are in `test-results/interview-sources-{desktop,mobile}.png`; later runs may overwrite them.
- C-2 was committed as `9177ea3` before C-3 implementation. No deployment, external setup, personal import or live model evaluation was performed. C-4 remains proposed.

## C-4 — Verify the complete flow with two users

Status: live verification reported complete by the user. This is user-reported acceptance, not an agent-observed live run; question-level measurements were not supplied.

**Outcome:** the owner and an invited user independently connect real workspaces and receive useful, sourced answers from the PC's model.

Scope:

- With explicit authorization for external setup and personal imports, verify real OAuth through the deployed frontend and PC backend. Distinguish local verification from deployed verification.
- Use a small selected corpus per account and 15–20 representative questions overall. Include paraphrases, unsupported questions and attempts to request another account's information.
- Identify expected passages before testing. Evaluate retrieval separately from factual support, usefulness and latency. Include questions that distinguish personal contributions from team outcomes.
- Start with existing SQLite retrieval. Record failures and propose a measured follow-up if needed; embeddings or model changes are not automatic additions to this milestone.
- Document operation, manual refresh, access loss, disconnect, host storage and evidence retention. Keep README updates concise and consistent with its voice.

Completion checks (reported complete by the user):

- [x] Each user completes connect, import, inspect, ask, edit in Notion, refresh and remove using their own account.
- [x] Live access loss and reconnect work without retaining retrieval access to content known to be inaccessible.
- [x] No cross-account sources appear in responses, model inputs or saved evidence, including when explicitly requested.
- [x] Disconnect removes the account's imported corpus and prevents future retrieval; conversation retention matches the warning.
- [x] Quality and latency targets are agreed before evaluation. Question-level results record failures as well as successes; successful transport alone does not establish acceptance.
- [x] Both users review the experience and remaining limitations before the track is marked complete.

## Source expansion — Chat and audio-derived Interview questions

Status: implemented and locally verified. Not deployed by this task.

The user authorized this extension after reporting the C-4 checks complete.

- Ordinary chat automatically uses available sources and preserves conversation history. Following user feedback, the chat source panel was removed; source management stays in Connections. The subsequent Interview simplification removes its control too.
- Audio-derived Interview questions remain editable and require explicit submission. The signed-in account's eligible imported passages are included automatically.
- Source selection is enforced on the backend. Answers retain the exact admitted evidence; missing matches must not justify invented personal claims.
- Preserve account isolation, existing context limits, failed-source exclusion and manual refresh. Retrieved documents cannot authorize tool execution.
- Automatic submission, microphone-context enrichment, deployment and model changes remain outside this extension.

Verification:

- `pnpm check` passed with 138 backend tests; `pnpm build` passed. The existing bundle-size warning remains.
- Backend tests inspect model inputs and saved evidence for ordinary chat and speech questions, including account isolation, source exclusion, missing matches, context limits and rejected tool calls. Sourced chat preserves bounded prior conversation history.
- The full browser run passed 112 tests and found an incorrect accessible-name locator in the new chat test. Correcting that locator made both new chat/audio tests pass. Screenshot inspection then caught mock replies echoing the internal source JSON; an explicit internal sourced-chat purpose corrected that without changing Ollama requests or ordinary JSON messages.
- After that correction, all nine affected chat/audio browser tests passed, including manual submission, source on/off, evidence retention, streaming, reload recovery and keyboard/mobile behavior. Desktop/mobile screenshots were inspected. Independent review, including the correction, found no remaining actionable issues.
- Follow-up UI simplification: normal chat now requests available sources automatically, with no source panel. A browser regression verifies automatic evidence, disconnect through Connections, no new evidence after disconnect and retained history. Chat with no usable sources preserves ordinary tools. `pnpm check` (138 tests), build and all 11 affected chat/audio/task browser tests passed; independent review found no actionable issues and mobile layout was inspected.
- Tests use isolated storage and synthetic Notion/audio/model inputs. No live Windows evaluation, deployment or external setup was performed for this extension. C-4's earlier user-reported acceptance does not establish live quality for these new paths.

## Verification and decisions before implementation

For code milestones, use Node 24+, install with `pnpm install --frozen-lockfile` when needed, and run `pnpm check` and `pnpm build`. Run `pnpm test:e2e` for UI and API contract changes. Automated tests use isolated databases and synthetic Notion responses, never live conversations. Account/token boundaries, migrations and disconnect races require independent review under the Pancake workflow. Record evidence and remaining gaps per milestone.

For C-1, the one-workspace default and staged disconnect behavior were adopted using the user's authorization to resolve inconsistencies. The callback is derived from `AUTH_ORIGIN`; current official Notion OAuth/token requirements were checked during implementation. Creating the integration or changing deployed settings still requires separate authorization. Keep secrets out of this document. Before C-2 owner migration, inspect actual stored sources; the report of no imports does not replace safe migration checks.

Repository instructions record C-1 through C-3 and the subsequent source expansion authorization. Audio submission remains explicit; automatic IA-5 work and microphone-context enrichment remain outside scope. C-4 acceptance above is attributed to the user.

Reference: [Notion authorization](https://developers.notion.com/guides/authorization/overview).

## Interview simplification

Status: implemented and locally verified. Not committed or deployed by this task.

The user explicitly requested removing the entire Interview controls icon/panel and all of its contents, without replacement. This supersedes earlier typed-form, source-toggle, draft-preservation and settings UI requirements. Interview retains live capture, editable detected questions, explicit submission, answers, sent-question history and transcripts. Normal chat is the typed entry point. Sources are automatic in both views and managed in Connections. Model preparation remains automatic on Start listening; model explanations live in documentation. Automatic submission and microphone-context enrichment remain excluded.

Verification: `pnpm check` passed (138 backend tests), `pnpm build` passed, and the full browser suite passed all 100 retained/adapted tests. Tests for removed typed/settings controls were removed; retained source, audio lifecycle, explicit submission, history, copy and scrolling checks were migrated to chat or the live workflow. Desktop/mobile screenshots confirm the icon and panel contents are absent. Independent review found no functional regressions; its documentation findings were corrected. The optional real-speech harness was updated and typechecked but not rerun; no live Windows deployment or model-quality evaluation was performed.

## Compact Connections styling

The user requested a denser Connections screen inspired by ChatGPT's plugins page. Updated the screen using Pancake typography/spacing tokens and 40px controls: smaller heading, inline workspace status, reduced card padding, flat imported-page rows and shorter repeated copy. Existing actions, warnings, privacy text and disconnect confirmation remain.

Baseline connection tests passed (10 tests), with screenshots retained under `/tmp/panky-connections-before`. After the restyle, `pnpm check` passed (138 backend tests), `pnpm build` passed, and all 15 affected browser tests passed. Connected/disconnected, mobile error, page picker and source detail screenshots were inspected. Independent review found no actionable issues. The public reference exposed only its loading shell and browser access was unavailable, so exact visual matching to the live plugins screen was not verified. No deployment was performed.

## Connections catalogue and navigation

The Connections sidebar now lists available connections (currently Notion) instead of chats. The landing page shows a compact Notion tile; selecting it or the sidebar entry opens the existing connection details. Details have a reloadable URL and a back action, and OAuth returns open the details view. Returning to Chats restores the conversation sidebar. Secondary and disabled connection actions have visible borders and readable text. The Start listening Mac signpost uses Pancake's neutral `StatusChip`.

Verification: `pnpm check` passed (138 backend tests), `pnpm build` passed, and all 102 browser tests passed. A final focused run passed four desktop/mobile navigation and listening-screen tests. Screenshots were inspected at desktop and mobile widths. Independent review identified lost keyboard focus when opening details; focus now moves to the back action, with regression coverage, and re-review found no remaining actionable issues. Tests use isolated storage and synthetic providers. Changes remain uncommitted and undeployed.


### Sidebar and component refinement

Chats and Connections now reuse `SidebarList` for search, filtering and rows, with independent search values. The visible available-connections heading and Back to interview action are removed. Notion details use a Connections / Notion breadcrumb with keyboard focus handling, plus Pancake Surface, Inline, Stack and StatusChip components. The installed Pancake package has no breadcrumb export, so the breadcrumb uses semantic navigation and its tokens. The Mac signpost is a compact “Mac only” chip beside Start listening.

Verification: the two catalogue baseline tests passed before the refinement. `pnpm check` passed with 138 backend tests; build passed. All 35 affected Connections, imported-page, chat and transcript browser tests passed, followed by two desktop/mobile checks after reducing chip height. Screenshots of both sidebars, Notion details and the listening screen were inspected. Direct review found no remaining actionable issues. No commit or deployment was performed.
