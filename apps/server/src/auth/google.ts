import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";

export const googleIdentitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
  email_verified: z.literal(true),
  nonce: z.string().min(1).max(256),
  hd: z.string().min(1).max(255).optional(),
});
export type GoogleIdentity = z.infer<typeof googleIdentitySchema>;
export type GoogleVerifier = (
  credential: string,
  audience: string,
) => Promise<GoogleIdentity>;

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  {
    timeoutDuration: 5000,
    cooldownDuration: 30000,
  },
);

export function createGoogleVerifier(
  keys: JWTVerifyGetKey = googleKeys,
): GoogleVerifier {
  return async (credential, audience) => {
    const { payload } = await jwtVerify(credential, keys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
      requiredClaims: ["exp", "iat", "sub", "email", "email_verified", "nonce"],
      maxTokenAge: "1h",
    });
    if (payload.azp !== undefined && payload.azp !== audience)
      throw new Error("Google authorized party does not match this client.");
    return googleIdentitySchema.parse(payload);
  };
}
export const verifyGoogleIdentity = createGoogleVerifier();
