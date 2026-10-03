import type { Env } from "../types";

/**
 * Signed user identity. The website's server (which knows who is signed in)
 * issues a short-lived token: "v1.<payload>.<signature>", where payload is
 * base64url JSON { e: email, x: expiry (unix seconds) } and the signature is
 * HMAC-SHA256 with a key derived from INTERNAL_SECRET (the secret the website
 * and Worker already share). Browsers can carry it but can't forge or alter it.
 */

const enc = new TextEncoder();
const KEY_LABEL = "vacancypal user token v1";

let keyCache: { secret: string; key: CryptoKey } | undefined;

function b64uDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** The signing key: HMAC(INTERNAL_SECRET, label), so the raw secret is never used directly. */
async function signingKey(secret: string): Promise<CryptoKey> {
  if (keyCache?.secret === secret) return keyCache.key;
  const master = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const derived = await crypto.subtle.sign("HMAC", master, enc.encode(KEY_LABEL));
  const key = await crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  keyCache = { secret, key };
  return key;
}

export type TokenCheck = { ok: true; email: string } | { ok: false; reason: "invalid" | "expired" | "unconfigured" };

/** Verify a user token (constant-time signature check) and return its email. */
export async function verifyUserToken(env: Env, token: string, now = Date.now()): Promise<TokenCheck> {
  if (!env.INTERNAL_SECRET) return { ok: false, reason: "unconfigured" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "invalid" };
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(env.INTERNAL_SECRET),
      b64uDecode(parts[2]),
      enc.encode(`v1.${parts[1]}`),
    );
    if (!valid) return { ok: false, reason: "invalid" };
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(parts[1]))) as { e?: unknown; x?: unknown };
    if (typeof payload.e !== "string" || !payload.e.includes("@") || typeof payload.x !== "number") {
      return { ok: false, reason: "invalid" };
    }
    if (payload.x * 1000 < now) return { ok: false, reason: "expired" };
    return { ok: true, email: payload.e };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

// Once the website sends signed tokens, unsigned "x-user-id" claims are refused
// for good. The switch flips itself on the first valid token, so deploying the
// Worker before the website never locks anyone out.
const SIGNED_FLAG = "security:signed-users";
let signedRequired = false;
let checkedAt = 0;

export async function requireSignedUsers(env: Env): Promise<boolean> {
  if (signedRequired) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  signedRequired = (await env.JOBS_CACHE.get(SIGNED_FLAG)) === "1";
  return signedRequired;
}

export async function markSignedUsersSeen(env: Env): Promise<void> {
  if (signedRequired) return;
  signedRequired = true;
  if ((await env.JOBS_CACHE.get(SIGNED_FLAG)) !== "1") await env.JOBS_CACHE.put(SIGNED_FLAG, "1");
}
