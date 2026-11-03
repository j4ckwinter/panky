import { z } from "zod";

export const modelSelectionSchema = z
  .object({
    provider: z.literal("chatgpt"),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export const chatGPTConnectionSchema = z
  .object({
    kind: z.enum([
      "unavailable",
      "disconnected",
      "connected",
      "reconnect_required",
    ]),
    email: z.email().optional(),
  })
  .strict();
export const chatGPTModelsSchema = z
  .object({
    models: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          name: z.string().min(1).max(200),
        }),
      )
      .max(200),
  })
  .strict();
