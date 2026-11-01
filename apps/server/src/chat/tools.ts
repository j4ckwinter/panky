import { z } from "zod";
import type { ToolDefinition } from "../providers/provider.js";

export interface Tool {
  definition: ToolDefinition;
  arguments: z.ZodType;
  execute(input: unknown, signal: AbortSignal): Promise<unknown>;
}
export const dateTimeTool: Tool = {
  definition: {
    name: "get_current_datetime",
    description: "Returns the current UTC date and time.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  arguments: z.object({}).strict(),
  async execute(_input, signal) {
    signal.throwIfAborted();
    return { timestamp: new Date().toISOString(), timezone: "UTC" };
  },
};
