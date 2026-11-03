# Notion experience in Panky

IA-2 adds selected page imports and local text retrieval to Interview. Importing creates a searchable copy on the backend; it does not train the model.

## Connect the owner's workspace

1. Create a Notion internal connection with **Read content** capability. Grant it access only to the pages you want available. Notion's [internal connection guide](https://developers.notion.com/guides/get-started/internal-connections) covers capabilities and page access. Sharing a parent also grants access to its children in Notion; Panky still requires a separate import for each child page.
2. Set `NOTION_TOKEN` privately in `apps/server/.env` on the backend machine and restart it. Use the connection's API token, not Panky's bearer token. Never put it in frontend configuration or the interview form.
3. Sign in as the Panky owner. Open **Interview → Notion experience**, enter a page link or ID, and choose **Import page**.
4. Inspect the title, timestamp, passage count and warnings. **Inspect passages** shows the local copy.

The configured connection belongs only to the Panky owner. Invited accounts cannot use it, view the owner's sources or retrieve them in answers. Storage remains scoped per authenticated user. [Personal Notion OAuth connections](notion-connections.md) are available separately in Connections; importing through those connections belongs to C-2 and is not implemented yet.

The importer makes only GET requests to `https://api.notion.com/v1`, using API version `2026-03-11`. It reads page metadata and child blocks, never arbitrary URLs. See the official [versioning](https://developers.notion.com/reference/versioning), [page](https://developers.notion.com/reference/retrieve-a-page) and [block children](https://developers.notion.com/reference/get-block-children) references.

## Ask and inspect evidence

Each interview question searches the local corpus. Up to three matching passages are included within the configured context budget, alongside any pasted sample. Short follow-ups can use recent questions and explicit spoken-answer notes to find the referenced experience. Standalone questions search their own terms; **Start new topic** clears earlier context. This is a bounded lexical heuristic, not semantic search.

Expand **Retrieved evidence** beneath an answer for the exact supplied excerpts, import timestamps and Notion block links. Labels `[S1]`, `[S2]` and `[S3]` identify the supplied passages. The real model is instructed to cite them, distinguish individual contributions from team work and label general suggestions. Inspect generated claims against the excerpts; citations are not a guarantee of factual accuracy.

Demo mode performs real local retrieval but keeps its generated response scripted and synthetic. It does not claim to summarise those passages.

Search uses SQLite FTS5 with stemming and a small set of synonym groups. It is lexical search, not semantic retrieval. Broad questions without relevant terms may return nothing; matching words do not guarantee relevance. Tests cover representative paraphrases, ranking and no-match cases. Evaluate retrieval with your own notes before relying on it.

## Refresh and remove

- **Refresh page**, or importing the same page again, atomically replaces the local passages and search index after a successful fetch. It keeps the source ID and avoids duplicates.
- Failed refreshes retain inspectable old content and its original timestamp, record the failed attempt and exclude that copy from new answers until a refresh succeeds. Both refresh paths display this status. No automatic retry occurs.
- Partial imports remain searchable but carry explicit warnings. Inspect the warnings and passages before using them.
- **Remove page** deletes the local source and its search index. It does not change Notion. Saved answers retain evidence snapshots and may quote removed material; delete those conversations separately if needed.
- Removing Notion access does not instantly purge a cached copy. Refresh or remove it explicitly; there is no background sync.

Only one import or refresh runs per user at a time. Overlapping imports, refreshes and removals are rejected. Browser sessions are checked again before content is saved. Disconnects and timeouts require an explicit retry.

## Supported content and bounds

Supported blocks include paragraphs, headings, lists, to-dos, toggles, quotes, callouts, code and table rows, including supported descendants inside tables and columns. Child pages, databases, synced blocks, media, files and unknown types are skipped with warnings. Import desired child pages explicitly. Properties other than the page title are not indexed, and attachments are not downloaded.

Each import is bounded to 30 seconds, 20 paced requests, 1 MiB per response, depth 5, 500 blocks, 100 passages and 60,000 text characters. Each passage is at most 1,200 characters, and each user can retain 50 sources. Traversal/content truncation produces warnings. API, malformed-content and response-size errors preserve the previous copy. Split very large pages before importing them.

Sources and answer snapshots are stored in plaintext SQLite alongside conversations. Protect and back up the database as described in the README. This change adds experience tables, an FTS index and a `sources` column to messages. Existing messages receive empty evidence lists. Update the backend before deploying a frontend that depends on the new endpoints.

## Verification and remaining acceptance

Automated checks use isolated databases and synthetic Notion responses. They cover authentication, exact-origin writes, account isolation, bounded imports, refresh/removal, lexical ranking, context admission and persisted snapshots. A test provider attempts a tool call after receiving malicious source text; the interview workflow rejects it. Prompt instructions alone do not prove that a real model always resists misleading content.

No personal Notion page has been imported during implementation. Live permissions and ranking against the user's notes remain unverified. The Windows PC is unavailable, so real-model citation accuracy and latency remain pending. `pnpm evaluate:interview` still evaluates pasted samples in an isolated database, not the live corpus.

When the connection and PC are available: import one selected page, inspect the copy, ask a question with an expected source, compare personal claims with their evidence, refresh an edited page and confirm old answers retain their original snapshots. Record model quality separately from successful import and retrieval.
