import { z } from "zod";

export const authStatusSchema = z.object({
  authenticated: z.boolean(),
  configured: z.boolean(),
});

export const deviceSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  current: z.boolean(),
});

export const deviceSessionsSchema = z.object({
  sessions: z.array(deviceSessionSchema),
});

export type AuthStatus = z.infer<typeof authStatusSchema>;
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
