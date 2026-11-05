import { pickAnalysisSchema, picksSchema } from "@panky/shared";

export function picksApi(
  request: (path: string, init?: RequestInit) => Promise<Response>,
) {
  const analysisPath = (id: string) =>
    `/picks/${encodeURIComponent(id)}/analysis`;
  return {
    async picks(signal?: AbortSignal) {
      return picksSchema.parse(
        await (await request("/picks", { signal })).json(),
      );
    },
    async refreshPicks(signal?: AbortSignal) {
      return picksSchema.parse(
        await (
          await request("/picks/refresh", { method: "POST", signal })
        ).json(),
      );
    },
    async pickAnalysis(id: string, signal?: AbortSignal) {
      return pickAnalysisSchema.parse(
        await (await request(analysisPath(id), { signal })).json(),
      );
    },
    async explainPick(id: string, question: string, signal: AbortSignal) {
      return pickAnalysisSchema.parse(
        await (
          await request(analysisPath(id), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
            signal,
          })
        ).json(),
      );
    },
  };
}
