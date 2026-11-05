import { z } from "zod";
import {
  type FootballSnapshot,
  footballSnapshotSchema,
  emptyCoverage,
  normalizeFootballFile,
  matchDateSchema,
} from "./data.js";

const maximumBytes = 2 * 1024 * 1024;
async function fetchJson(
  url: string,
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Panky-data-audit", Accept: "application/json" },
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, data: null };
  }
  if (!response.body) throw new Error("Source response had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximumBytes)
        throw new Error("Source response exceeded 2 MiB.");
      chunks.push(part.value);
    }
    return {
      status: response.status,
      data: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
    };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function auditFootballData(
  options: { revision?: string; asOf?: string } = {},
): Promise<FootballSnapshot> {
  const asOf = matchDateSchema.parse(
    options.asOf ?? new Date().toISOString().slice(0, 10),
  );
  let revision = options.revision;
  if (revision === undefined) {
    const result = await fetchJson(
      "https://api.github.com/repos/openfootball/football.json/commits/master",
    );
    if (result.status !== 200)
      throw new Error(
        `Could not resolve source revision: HTTP ${result.status}.`,
      );
    revision = z
      .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
      .parse(result.data).sha;
  }
  z.string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(revision);
  const snapshot: FootballSnapshot = {
    source: {
      name: "OpenFootball",
      revision,
      retrievedAt: new Date().toISOString(),
      license: "CC0-1.0",
      asOf,
    },
    matches: [],
    coverage: [],
  };
  const year =
    Number(asOf.slice(0, 4)) - (Number(asOf.slice(5, 7)) < 7 ? 1 : 0);
  const seasons = [year - 2, year - 1, year].map(
    (start) => `${start}-${String((start + 1) % 100).padStart(2, "0")}`,
  );
  for (const season of seasons) {
    for (const competition of ["en.1", "en.2", "en.3", "en.4"] as const) {
      const coverage = emptyCoverage(competition, season);
      try {
        const response = await fetchJson(
          `https://raw.githubusercontent.com/openfootball/football.json/${revision}/${season}/${competition}.json`,
        );
        if (response.status !== 200) {
          snapshot.coverage.push({
            ...coverage,
            status: response.status === 404 ? "missing" : "error",
            issues: [`HTTP ${response.status}; no matches imported.`],
          });
          continue;
        }
        const result = normalizeFootballFile(response.data, {
          competition,
          season,
          asOf,
        });
        snapshot.coverage.push(result.coverage);
        snapshot.matches.push(...result.matches);
      } catch {
        snapshot.coverage.push({
          ...coverage,
          status: "error",
          issues: [
            "Source request failed, timed out, exceeded its limit or returned invalid JSON; no matches imported.",
          ],
        });
      }
    }
  }
  snapshot.source.retrievedAt = new Date().toISOString();
  return footballSnapshotSchema.parse(snapshot);
}
