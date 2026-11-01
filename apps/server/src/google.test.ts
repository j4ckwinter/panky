import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createGoogleVerifier } from "./google.js";

test("Google credential verifier checks signatures, issuer, audience, expiry and identity claims", async () => {
  const pair = await generateKeyPair("RS256");
  const key = await exportJWK(pair.publicKey);
  key.kid = "test-key";
  const verify = createGoogleVerifier(createLocalJWKSet({ keys: [key] }));
  const audience = "test.apps.googleusercontent.com";
  const base = {
    iss: "https://accounts.google.com",
    aud: audience,
    sub: "subject",
    email: "OWNER@gmail.com",
    email_verified: true,
    nonce: "bound-nonce",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  const sign = (
    changes: Record<string, unknown> = {},
    signingKey = pair.privateKey,
  ) =>
    new SignJWT({ ...base, ...changes })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .sign(signingKey);
  assert.equal((await verify(await sign(), audience)).email, "owner@gmail.com");
  for (const changes of [
    { iss: "https://attacker.example" },
    { aud: "other.apps.googleusercontent.com" },
    { azp: "other.apps.googleusercontent.com" },
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { iat: Math.floor(Date.now() / 1000) + 300 },
    { email_verified: false },
    { nonce: "" },
    { sub: "" },
  ])
    await assert.rejects(() =>
      sign(changes).then((jwt) => verify(jwt, audience)),
    );
  const attacker = await generateKeyPair("RS256");
  await assert.rejects(() =>
    sign({}, attacker.privateKey).then((jwt) => verify(jwt, audience)),
  );
  const valid = await sign();
  await assert.rejects(() => verify(valid.slice(0, -4) + "AAAA", audience));
});
