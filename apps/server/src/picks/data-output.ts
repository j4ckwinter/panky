import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type FootballSnapshot, footballSnapshotSchema } from "./data.js";

export async function writeFootballAudit(
  snapshot: FootballSnapshot,
  directory: string,
) {
  footballSnapshotSchema.parse(snapshot);
  const destination = resolve(directory);
  await mkdir(destination, { recursive: true });
  const report = {
    source: snapshot.source,
    coverage: snapshot.coverage,
    limitations: [
      "Source match dates have no verified kickoff timezone. No kickoff instants are inferred.",
      "Retrieval time is recorded, but historical result publication timestamps are unavailable. Retrospective evaluation cannot prove point-in-time source availability.",
      "Missing full-time scores remain unknown. Invalid files are excluded in full; no malformed partial file is used for modelling.",
      "No shots, injuries, xG, player news or odds are imported.",
    ],
  };
  await writeAtomically(resolve(destination, "report.json"), report);
  const usable =
    !snapshot.coverage.some((item) => item.status === "error") &&
    snapshot.matches.length > 0;
  if (usable)
    await writeAtomically(resolve(destination, "source.json"), snapshot);
  return { report, usable };
}

async function writeAtomically(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
