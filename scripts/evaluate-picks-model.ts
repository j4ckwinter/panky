import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { readFootballSnapshot } from "../apps/server/src/picks/data-read.js";
import { evaluateFootballModel } from "../apps/server/src/picks/evaluation.js";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: "data/picks/source.json" },
    output: { type: "string", default: "data/picks/evaluation.json" },
    season: { type: "string", default: "2025-26" },
  },
});
try {
  const snapshot = await readFootballSnapshot(resolve(values.source));
  const report = evaluateFootballModel(snapshot, { season: values.season });
  const destination = resolve(values.output);
  if (destination === resolve(values.source))
    throw new Error("Evaluation output must not replace the source snapshot.");
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  process.stdout.write(
    `${JSON.stringify({ modelVersion: report.modelVersion, season: report.season, source: report.source, model: report.model, baseline: report.baseline, output: destination }, null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Model evaluation failed."}\n`,
  );
  process.exitCode = 1;
}
