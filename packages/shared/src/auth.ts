import { z } from "zod";

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: z.enum(["owner", "member"]),
});
export const authStatusSchema = z.object({
  authenticated: z.boolean(),
  configured: z.boolean(),
  user: authUserSchema.nullable(),
  googleClientId: z.string().min(1).nullable(),
});
export const googleOptionsSchema = z.object({
  nonce: z.string().min(1),
  clientId: z.string().min(1),
});
export const accessSchema = z.object({
  invites: z.array(z.object({ email: z.email() })),
  users: z.array(authUserSchema.extend({ active: z.boolean() })),
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
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthStatus = z.infer<typeof authStatusSchema>;
export type Access = z.infer<typeof accessSchema>;
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
