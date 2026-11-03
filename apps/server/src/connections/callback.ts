import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import { HttpError } from "../http-utils.js";

export const callbackPath = "/api/connections/notion/callback";

export function notionCallbackPage(
  url: URL,
  response: ServerResponse,
  origin: string,
) {
  const allowed = new Set(["state", "code", "error"]);
  if (
    url.search.length > 4096 ||
    [...url.searchParams.keys()].some(
      (key) => !allowed.has(key) || url.searchParams.getAll(key).length !== 1,
    )
  ) {
    throw new HttpError(400, "Invalid Notion callback.");
  }
  const nonce = randomBytes(24).toString("base64");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  );
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connecting Notion — Panky</title><p>Connecting Notion…</p><noscript>Enable JavaScript and connect Notion again from Panky.</noscript><script nonce="${nonce}">
    const input = Object.fromEntries(new URLSearchParams(location.search));
    history.replaceState(null, '', ${JSON.stringify(callbackPath)});
    async function complete() {
      let result = 'error';
      try {
        const response = await fetch('/api/connections/notion/complete', {
          method: 'POST', credentials: 'same-origin',
          headers: {'Content-Type':'application/json'}, body: JSON.stringify(input)
        });
        if (response.ok) {
          const body = await response.json();
          if (['connected','denied','error'].includes(body.result)) result = body.result;
        }
      } catch {}
      location.replace(${JSON.stringify(`${origin}/?view=connections&notion=`)} + result);
    }
    void complete();
  </script></html>`);
}
