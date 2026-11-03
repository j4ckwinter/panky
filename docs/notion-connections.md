# Personal Notion connections

C-1 lets each signed-in Panky account connect one Notion workspace through OAuth, check its access and disconnect. It does not import pages or add evidence to answers yet. The existing owner-only internal connection remains separate; invited accounts cannot use its credentials.

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

The three settings belong only on the backend. Missing configuration leaves the feature unavailable; incomplete or malformed configuration fails startup. Do not replace the key on every restart. Losing or changing it makes previously encrypted credentials unreadable and requires reconnecting affected accounts. There is no automatic key rotation in C-1.

Panky retains its strict session cookie. Notion returns to a small callback page that clears the authorization query and completes the exchange using a same-origin authenticated request. The initiating Panky session must still be valid. The application does not log the callback query; configure any external proxy/request logging to omit authorization codes and OAuth state as well. Live proxy behavior still needs verification.

## Connect and check

Open **Connections** in the feature rail or mobile menu, then **Connect Notion**. Authorize the workspace and pages you want Panky to access. You return to Connections with the workspace name and connection date. Connecting alone does not copy any pages.

**Check connection** explicitly verifies the stored token with Notion. If necessary, Panky attempts one refresh and persists the replacement credentials. Failed authorization requires **Reconnect Notion**. Temporary HTTP failures preserve credentials for a manual retry. If a refresh response is lost or malformed, Panky requires reconnection because it cannot safely establish which rotated credentials are valid. Merely viewing the page does not call Notion or detect remote revocation immediately.

Each account sees only its own connection. Imported content in later milestones will be stored and processed on the Windows host; it is not private from the machine's operator.

## Disconnect and reconnect

**Disconnect Notion** asks for confirmation, removes local credentials and cancels pending connection work. Late callback or check responses cannot recreate a disconnected connection. Existing owner imports and saved conversations remain unchanged in C-1 because this OAuth connection has no imported sources yet.

Disconnect removes the connection from Panky; remove the integration's access in Notion as well if you want to revoke that grant there. Reconnecting to a different workspace requires disconnecting first. The future import milestone will add deletion of sources associated with the OAuth connection, while preserving already-saved conversation evidence as disclosed before deletion.

## Verification

Automated tests use synthetic Notion responses and isolated databases. Browser tests pass through a synthetic external authorization page and the real local callback/completion endpoints, including the strict-cookie return. They do not grant access to real workspaces.

Before claiming live acceptance, configure the integration and verify owner and invited-user authorization through the actual frontend proxy. Check denial, expired access, reconnect and disconnect. Real page imports and retrieval evaluation belong to later milestones.
