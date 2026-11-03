# ChatGPT subscription prototype

This opt-in prototype connects the Panky owner's ChatGPT plan. Other accounts continue using the configured local provider. There is no API key or API-billing fallback. Plan limits still apply.

The official flow is intended for local/open-source apps. OpenAI documents self-hosted runtimes, but Panky's Vercel/tunnel arrangement has not been confirmed eligible for general hosted use. Do not offer subscription connections to invited users without resolving that requirement. See [availability](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt#usage-policy-and-terms) and [self-hosted guidance](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).

## Connect on the Windows PC

1. Stop Panky's backend and launcher. Leave Ollama installed and configured as before.
2. In `apps/server/.env`, set `CHATGPT_ENABLED=true`. The default credential path is `./data/chatgpt/credentials.json`, relative to `apps/server` when using the workspace commands.
3. From the repository root, run `pnpm connect:chatgpt`. Complete sign-in in the browser on that same PC and authorize use of your plan. The local callback cannot be completed from your phone or another computer.
4. Run `pnpm build`, then restart Panky with `.\scripts\start-panky.ps1`.
5. Sign in to Panky as the owner. Open **Connections → ChatGPT** and check the connection. Select an available ChatGPT model in chat or Interview to use it for the next explicit submission.

The app defaults to the configured local provider after reload. A ChatGPT selection remains selected on failure or disconnect: Panky reports the error and never resubmits using another provider. Choose the local provider explicitly to return to Ollama. The prototype sends no Panky tools to ChatGPT.

## Data and credentials

Selecting ChatGPT sends the question, bounded conversation context and relevant retrieved source passages to OpenAI. Notion credentials stay on the server. Existing local transcription remains local; submitted transcript text is part of the question.

OAuth credentials are stored only on the PC. Files are atomically replaced with owner-only Unix permissions or a current-user Windows ACL. Keep the credential directory private and out of backups shared with others. Credentials are never returned to the web UI. Access renewals are serialized; a leftover `.lock` file after a crashed process must only be removed once all Panky/connect processes have stopped.

**Disconnect ChatGPT** stops local use and attempts to revoke the renewable session. If revocation cannot be confirmed, also disconnect Panky in ChatGPT settings. Saved conversations are retained. To switch the connected ChatGPT account, disconnect first and run local sign-in again.

Manage the application's plan allowance at [ChatGPT usage settings](https://chatgpt.com/settings/usage). Reaching a limit produces an error; Panky does not purchase credits or use paid API credentials.

## Verification limits

Automated checks use synthetic OAuth, model-list and streaming responses with isolated credential files and databases. They cannot establish your subscription's entitlement, live model quality, Windows ACL behavior or hosted-app eligibility. The first live sign-in and completed answer must be verified on your PC.
