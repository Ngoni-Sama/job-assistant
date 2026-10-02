import type { Env } from "../types";

/**
 * Encrypt/decrypt Google refresh tokens at rest (AES-256-GCM, Web Crypto).
 * The key is the TOKEN_KEY Worker secret: 32 random bytes, base64-encoded.
 * Stored format: base64(iv[12] || ciphertext+tag).
 */

async function key(env: Env): Promise<CryptoKey> {
  if (!env.TOKEN_KEY) throw new Error("TOKEN_KEY secret is not set");
  const raw = Uint8Array.from(atob(env.TOKEN_KEY), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("TOKEN_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function encryptToken(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function decryptToken(env: Env, stored: string): Promise<string> {
  const all = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await key(env), all.slice(12));
  return new TextDecoder().decode(pt);
}

export const gtokenKey = (userId: string) => `gtoken:${userId}`;
