import "server-only";
import { createHmac } from "node:crypto";

/**
 * Signed user identity for calls to the Worker. Must match
 * packages/backend/src/lib/usertoken.ts: "v1.<payload>.<signature>" with
 * payload = base64url JSON { e: email, x: expiry in unix seconds } and an
 * HMAC-SHA256 signature using a key derived from WORKER_INTERNAL_SECRET (the
 * Worker's INTERNAL_SECRET). Only this server can mint them.
 */

const KEY_LABEL = "vacancypal user token v1";
/** How long a token lasts; the browser fetches a fresh one before it runs out. */
export const USER_TOKEN_TTL_SECONDS = 60 * 60;

export function signUserToken(email: string, ttlSeconds = USER_TOKEN_TTL_SECONDS): string | null {
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!secret || !email) return null;
  const key = createHmac("sha256", secret).update(KEY_LABEL).digest();
  const payload = Buffer.from(
    JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const signature = createHmac("sha256", key).update(`v1.${payload}`).digest("base64url");
  return `v1.${payload}.${signature}`;
}

/** Headers that identify `email` to the Worker (signed token + the plain id for older Workers). */
export function userHeaders(email: string): Record<string, string> {
  const token = signUserToken(email);
  return token ? { "x-user-id": email, "x-user-token": token } : { "x-user-id": email };
}
