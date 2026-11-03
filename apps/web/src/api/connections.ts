import {
  experienceDetailSchema,
  experienceSourceSchema,
  notionAuthorizationSchema,
  notionConnectionSchema,
  notionPagesSchema,
  notionSourcesSchema,
} from "@panky/shared";

type Request = (path: string, init?: RequestInit) => Promise<Response>;
const root = "/connections/notion";
function deadline(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(35_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function connectionApi(request: Request) {
  return {
    async notionConnection(signal?: AbortSignal) {
      return notionConnectionSchema.parse(
        await (await request(root, { signal: deadline(signal) })).json(),
      );
    },
    async authorizeNotion() {
      return notionAuthorizationSchema.parse(
        await (await request(`${root}/authorize`, { method: "POST" })).json(),
      );
    },
    async checkNotion() {
      return notionConnectionSchema.parse(
        await (
          await request(`${root}/check`, { method: "POST", signal: deadline() })
        ).json(),
      );
    },
    async disconnectNotion() {
      await request(root, { method: "DELETE" });
    },
    async searchNotionPages(
      input: { query?: string; cursor?: string },
      signal?: AbortSignal,
    ) {
      return notionPagesSchema.parse(
        await (
          await request(`${root}/pages/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: deadline(signal),
          })
        ).json(),
      );
    },
    async notionSources(signal?: AbortSignal) {
      return notionSourcesSchema.parse(
        await (
          await request(`${root}/sources`, { signal: deadline(signal) })
        ).json(),
      );
    },
    async importNotionSource(page: string, signal?: AbortSignal) {
      return experienceSourceSchema.parse(
        await (
          await request(`${root}/sources`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page }),
            signal: deadline(signal),
          })
        ).json(),
      );
    },
    async notionSourceDetail(id: string, signal?: AbortSignal) {
      return experienceDetailSchema.parse(
        await (
          await request(`${root}/sources/${encodeURIComponent(id)}`, {
            signal: deadline(signal),
          })
        ).json(),
      );
    },
    async refreshNotionSource(id: string, signal?: AbortSignal) {
      return experienceSourceSchema.parse(
        await (
          await request(`${root}/sources/${encodeURIComponent(id)}/refresh`, {
            method: "POST",
            signal: deadline(signal),
          })
        ).json(),
      );
    },
    async removeNotionSource(id: string, signal?: AbortSignal) {
      await request(`${root}/sources/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal: deadline(signal),
      });
    },
  };
}
