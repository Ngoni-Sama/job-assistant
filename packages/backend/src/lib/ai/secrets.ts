import type { Env } from "../../types";
import { decryptToken, encryptToken } from "../tokens";

/**
 * AI provider API keys, kept apart from the app config and encrypted at rest
 * (AES-256-GCM with the TOKEN_KEY Worker secret). The admin dashboard can set,
 * test and remove a key, but a saved key is never sent back to any browser —
 * only its last 4 characters and when it was saved.
 */

export type KeyProvider = "openai" | "anthropic";
export const KEY_PROVIDERS: KeyProvider[] = ["openai", "anthropic"];

type StoredKey = { enc: string; last4: string; savedAt: string };
type Stored = Partial<Record<KeyProvider, StoredKey>>;

const SECRETS_KEY = "secrets:ai";
const CACHE_MS = 60_000;
let cache: { at: number; keys: Partial<Record<KeyProvider, string>> } | null = null;

async function readStored(env: Env): Promise<Stored> {
  return (await env.JOBS_CACHE.get<Stored>(SECRETS_KEY, "json")) ?? {};
}

/** Decrypted keys for making AI calls (cached briefly per Worker instance). */
export async function getAiKeys(env: Env): Promise<Partial<Record<KeyProvider, string>>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.keys;
  const stored = await readStored(env);
  const keys: Partial<Record<KeyProvider, string>> = {};
  for (const p of KEY_PROVIDERS) {
    const s = stored[p];
    if (!s) continue;
    try {
      keys[p] = await decryptToken(env, s.enc);
    } catch (err) {
      console.error(`Can't decrypt the ${p} key (was TOKEN_KEY changed?)`, err);
    }
  }
  cache = { at: Date.now(), keys };
  return keys;
}

export async function setAiKey(env: Env, provider: KeyProvider, key: string): Promise<void> {
  const stored = await readStored(env);
  stored[provider] = { enc: await encryptToken(env, key), last4: key.slice(-4), savedAt: new Date().toISOString() };
  await env.JOBS_CACHE.put(SECRETS_KEY, JSON.stringify(stored));
  cache = null;
}

export async function removeAiKey(env: Env, provider: KeyProvider): Promise<void> {
  const stored = await readStored(env);
  delete stored[provider];
  await env.JOBS_CACHE.put(SECRETS_KEY, JSON.stringify(stored));
  cache = null;
}

export type KeyStatus = Record<KeyProvider, { set: boolean; last4?: string; savedAt?: string }>;

export async function aiKeyStatus(env: Env): Promise<KeyStatus> {
  const stored = await readStored(env);
  return Object.fromEntries(
    KEY_PROVIDERS.map((p) => [p, stored[p] ? { set: true, last4: stored[p]!.last4, savedAt: stored[p]!.savedAt } : { set: false }]),
  ) as KeyStatus;
}

/** Basic shape check before we try a key (catches pasting the wrong thing). */
export function keyLooksRight(provider: KeyProvider, key: string): boolean {
  if (/\s/.test(key) || key.length < 20 || key.length > 400) return false;
  return provider === "anthropic" ? key.startsWith("sk-ant-") : key.startsWith("sk-") && !key.startsWith("sk-ant-");
}
