# Personal Notion connections

Each signed-in Panky account can connect one Notion workspace through OAuth and import selected pages in Connections. Copies are scoped to that account and can supply evidence to typed interview answers. The existing owner-only internal connection remains separate; invited accounts cannot use its credentials.

## Host setup

External setup is manual. These instructions do not mean an integration has been created or deployed.

1. Create a Notion OAuth integration with **Read content** capability and an installation scope that includes your users' workspaces. Do not enable content insertion or updates. See [Notion authorization](https://developers.notion.com/guides/authorization/overview).
2. Register the exact callback URL: your backend's `AUTH_ORIGIN` followed by `/api/connections/notion/callback`. For the current frontend, this is `https://panky.vercel.app/api/connections/notion/callback`. Local development uses `http://localhost:5173/api/connections/notion/callback`. The frontend's existing `/api` proxy carries this request to the PC; do not register the ngrok address instead.
3. Set `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET` in `apps/server/.env` using the integration's credentials.
4. Generate a token-encryption key locally:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Save the result as `NOTION_TOKEN_KEY` in `apps/server/.env`. Keep it private and back it up separately from the database. Restart the backend.

The three settings belong only on the backend. Missing configuration leaves the feature unavailable; incomplete or malformed configuration fails startup. Do not replace the key on every restart. Losing or changing it makes previously encrypted credentials unreadable and requires reconnecting affected accounts. There is no automatic encryption-key rotation.

Panky retains its strict session cookie. Notion returns to a small callback page that clears the authorization query and completes the exchange using a same-origin authenticated request. The initiating Panky session must still be valid. The application does not log the callback query; configure any external proxy/request logging to omit authorization codes and OAuth state as well. Live proxy behavior still needs verification.

## Connect and check

Open **Connections** in the feature rail or mobile menu, then **Connect Notion**. Authorize the workspace and pages you want Panky to access. You return to Connections with the workspace name and connection date. Connecting alone does not copy any pages.

**Check connection** explicitly verifies the stored token with Notion. If necessary, Panky attempts one refresh and persists the replacement credentials. Failed authorization requires **Reconnect Notion**. Temporary HTTP failures preserve credentials for a manual retry. If a refresh response is lost or malformed, Panky requires reconnection because it cannot safely establish which rotated credentials are valid. Merely viewing the page does not call Notion or detect remote revocation immediately.

Each account sees only its own connection and sources. Imported content is stored and processed on the Windows host; it is not private from the machine's operator.

## Choose and manage pages

After connecting, choose **Choose pages** (or **Add pages** once you have copies). Search by title, select pages and explicitly import them. Loading another page of results does not import it. Search only shows content accessible to your connection and may lag sharing changes; it is not a complete inventory. Search again or enter a page link if a page is missing. See [Notion search limitations](https://developers.notion.com/reference/search-optimizations-and-limitations).

Granting access in Notion and importing a copy into Panky are separate actions. Child pages require their own selection. Imports reuse the [supported-content bounds](notion-experience.md#supported-content-and-bounds), including a maximum of 50 sources per account. Partial imports show warnings; inspect passages before relying on them.

**Inspect passages** shows the local copy. **Refresh page** replaces it after a successful fetch. **Refresh all** processes the current bounded list sequentially, displays progress and reports each page's result. Failed refreshes keep the old copy inspectable but exclude it from new answers. There are no automatic retries or background synchronization. Leaving Connections stops the current browser operation and remaining batch work.

**Remove page** deletes its copy and search index. It does not alter Notion or saved answers. Connection authorization failures require reconnection and exclude the connection's corpus from new retrieval. Temporary failures can be retried manually; remote revocation is not detected instantly. Import timestamps show when the local content was last fetched.

## Existing owner imports

Existing sources are not automatically assigned to an OAuth workspace. To migrate one, explicitly import its page through Connections. Only a successful read using the owner's OAuth credential moves that source to the connection; a failed attempt leaves the legacy copy intact. Source IDs and saved evidence snapshots are preserved. The existing internal importer remains available for legacy sources until its callers and host setup are retired deliberately. It cannot refresh an OAuth-managed copy using the server token.

The configured local database was inspected read-only on 3 November 2026 and contained zero sources. This does not establish the state of the Windows host. The schema migration preserves existing sources there and requires no bulk deletion or reassignment.

## Disconnect and reconnect

**Disconnect Notion** asks for confirmation, cancels connection work and deletes credentials, imported copies attached to that connection and their search index. Late callbacks, imports and refreshes cannot restore disconnected state. Saved conversations and their evidence snapshots remain; remove those conversations separately to delete retained excerpts. Legacy owner imports stay separate.

Disconnect removes the connection from Panky; remove the integration's access in Notion as well if you want to revoke that grant there. Reconnecting to a different workspace requires disconnecting first. Reauthorizing the same workspace keeps its association. Copies excluded after an authorization failure must be refreshed successfully before they can supply new evidence.

## Verification

Automated tests use synthetic Notion responses and isolated databases. Browser tests pass through a synthetic external authorization page and the real local callback/completion endpoints, including the strict-cookie return. They do not grant access to real workspaces.

Before claiming live acceptance, configure the integration and verify owner and invited-user authorization through the actual frontend proxy. Check denial, expired access, reconnect and disconnect. Live personal imports and retrieval quality remain unverified; the two-user live acceptance work belongs to C-4.
