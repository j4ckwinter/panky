import { open } from "node:fs/promises";
import { footballSnapshotSchema, type FootballSnapshot } from "./data.js";

export async function readFootballSnapshot(
  path: string,
): Promise<FootballSnapshot> {
  const source = await open(path, "r");
  try {
    const limit = 8 * 1024 * 1024;
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await source.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > limit) throw new Error("Source snapshot exceeds 8 MiB.");
    return footballSnapshotSchema.parse(
      JSON.parse(buffer.subarray(0, size).toString("utf8")),
    );
  } finally {
    await source.close();
  }
}
