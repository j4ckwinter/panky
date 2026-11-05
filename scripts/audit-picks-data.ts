import { parseArgs } from "node:util";
import { auditFootballData } from "../apps/server/src/picks/data-fetch.js";
import { writeFootballAudit } from "../apps/server/src/picks/data-output.js";

const { values } = parseArgs({
  options: {
    output: { type: "string", default: "data/picks" },
    revision: { type: "string" },
    "as-of": { type: "string" },
  },
});
try {
  const snapshot = await auditFootballData({
    revision: values.revision,
    asOf: values["as-of"],
  });
  const { report, usable } = await writeFootballAudit(snapshot, values.output);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!usable) process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Data audit failed."}\n`,
  );
  process.exitCode = 1;
}
