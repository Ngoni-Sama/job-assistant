import type { Env, NotifyPrefs, NotifyType, PushSub } from "../types";
import { decryptToken, encryptToken } from "./tokens";

/**
 * Web Push for Workers — no Node libraries, just Web Crypto:
 *  - VAPID (RFC 8292): an ES256-signed JWT identifies this server to the push
 *    service. The key pair is generated once and kept in KV (the private half
 *    encrypted with TOKEN_KEY when that secret is set).
 *  - Message encryption (RFC 8291, aes128gcm): only the user's browser can read
 *    the payload; the push service just relays ciphertext.
 */

const VAPID_KEY = "push:vapid";
const SUBJECT = "mailto:support@vacancypal.co.zw";
const MAX_DEVICES = 5;

const enc = new TextEncoder();

export function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
}

/* ------------------------------------------------------------------ VAPID */

type Vapid = { publicKey: string; privateJwk: JsonWebKey };
let vapidCache: Vapid | undefined;

/** The server's push key pair (created on first use). `publicKey` goes to browsers. */
export async function getVapid(env: Env): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const stored = await env.JOBS_CACHE.get<{ publicKey: string; private: string; encrypted: boolean }>(VAPID_KEY, "json");
  if (stored) {
    const raw = stored.encrypted ? await decryptToken(env, stored.private) : stored.private;
    vapidCache = { publicKey: stored.publicKey, privateJwk: JSON.parse(raw) as JsonWebKey };
    return vapidCache;
  }
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKey = b64uEncode(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer));
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const plain = JSON.stringify(privateJwk);
  const encrypted = !!env.TOKEN_KEY;
  await env.JOBS_CACHE.put(
    VAPID_KEY,
    JSON.stringify({ publicKey, private: encrypted ? await encryptToken(env, plain) : plain, encrypted }),
  );
  vapidCache = { publicKey, privateJwk };
  return vapidCache;
}

/** `Authorization` header value proving this server may push to `endpoint`. */
export async function vapidAuthorization(vapid: Vapid, endpoint: string, now = Date.now()): Promise<string> {
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(
    enc.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: SUBJECT }),
    ),
  );
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${b64uEncode(signature)}, k=${vapid.publicKey}`;
}

/* ------------------------------------------------------------- encryption */

/** Encrypt a payload for one browser subscription (aes128gcm, single record). */
export async function encryptPayload(sub: Pick<PushSub, "p256dh" | "auth">, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);

  const ephemeral = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", ephemeral.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      // The runtime field is `public`; workers-types names it `$public`.
      { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      ephemeral.privateKey,
      256,
    ),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marks the last (only) record.
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))),
  );

  // Header: salt(16) | record size(4, big-endian) | key id length(1) | key id (our public key).
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/* ---------------------------------------------------------- subscriptions */

const subsKey = (userId: string) => `pushsubs:${userId}`;
export const PUSH_SUBS_PREFIX = "pushsubs:";

async function endpointKey(endpoint: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(endpoint)));
  return `pushep:${b64uEncode(digest)}`;
}

/** Only real browser push services — the Worker must never POST to arbitrary URLs. */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return (
      h === "fcm.googleapis.com" ||
      h.endsWith(".push.services.mozilla.com") ||
      h.endsWith(".notify.windows.com") ||
      h.endsWith(".push.apple.com")
    );
  } catch {
    return false;
  }
}

export async function getSubs(env: Env, userId: string): Promise<PushSub[]> {
  return (await env.JOBS_CACHE.get<PushSub[]>(subsKey(userId), "json")) ?? [];
}

async function removeSub(env: Env, userId: string, endpoint: string): Promise<void> {
  const subs = await getSubs(env, userId);
  const next = subs.filter((s) => s.endpoint !== endpoint);
  if (next.length === subs.length) return;
  if (next.length) await env.JOBS_CACHE.put(subsKey(userId), JSON.stringify(next));
  else await env.JOBS_CACHE.delete(subsKey(userId));
}

/** Register a browser for a user. A device belongs to whoever signed in on it last. */
export async function addSub(env: Env, userId: string, sub: PushSub): Promise<number> {
  const epKey = await endpointKey(sub.endpoint);
  const previousOwner = await env.JOBS_CACHE.get(epKey);
  if (previousOwner && previousOwner !== userId) await removeSub(env, previousOwner, sub.endpoint);

  const subs = (await getSubs(env, userId)).filter((s) => s.endpoint !== sub.endpoint);
  subs.push(sub);
  const kept = subs.slice(-MAX_DEVICES);
  await env.JOBS_CACHE.put(subsKey(userId), JSON.stringify(kept));
  if (previousOwner !== userId) await env.JOBS_CACHE.put(epKey, userId);
  return kept.length;
}

export async function deleteSub(env: Env, userId: string, endpoint: string): Promise<void> {
  await removeSub(env, userId, endpoint);
  await env.JOBS_CACHE.delete(await endpointKey(endpoint));
}

/* ---------------------------------------------------------------- sending */

export type PushPayload = {
  type: NotifyType | "test";
  title: string;
  body: string;
  /** Page the notification opens. */
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
  silent?: boolean;
  /** Unread messages, for the app icon badge. */
  badge?: number;
};

/**
 * Deliver a payload to every device a user registered. Devices the push
 * service reports as gone (404/410) are forgotten. Returns how many were sent.
 */
export async function sendPush(
  env: Env,
  userId: string,
  payload: PushPayload,
  opts: { ttl?: number; urgency?: "low" | "normal" | "high" } = {},
): Promise<number> {
  const subs = await getSubs(env, userId);
  if (!subs.length) return 0;
  const vapid = await getVapid(env);
  const body = enc.encode(JSON.stringify(payload));
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      let step = "sign";
      try {
        const authorization = await vapidAuthorization(vapid, s.endpoint);
        step = "encrypt";
        const encrypted = await encryptPayload(s, body);
        step = "send";
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(opts.ttl ?? 86_400),
            Urgency: opts.urgency ?? "normal",
          },
          body: encrypted,
        });
        if (res.ok) sent++;
        else if (res.status === 404 || res.status === 410) dead.push(s.endpoint);
        else console.error("push rejected", res.status, await res.text().catch(() => ""));
      } catch (err) {
        console.error(`push failed (${step})`, err);
      }
    }),
  );

  for (const endpoint of dead) await deleteSub(env, userId, endpoint);
  return sent;
}

/* ------------------------------------------------------------ preferences */

/** A switch that was never touched counts as on. */
export function notifyEnabled(prefs: NotifyPrefs | undefined, type: NotifyType): boolean {
  return prefs?.[type] !== false;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTime(v: unknown): v is string {
  return typeof v === "string" && HHMM.test(v);
}

/** Inside the user's quiet hours? Times are Zimbabwe time (CAT = UTC+2, no DST). */
export function inQuietHours(prefs: NotifyPrefs | undefined, now = new Date()): boolean {
  const a = HHMM.exec(prefs?.quietStart ?? "");
  const b = HHMM.exec(prefs?.quietEnd ?? "");
  if (!a || !b) return false;
  const start = Number(a[1]) * 60 + Number(a[2]);
  const end = Number(b[1]) * 60 + Number(b[2]);
  if (start === end) return false;
  const minutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 120) % 1440;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
