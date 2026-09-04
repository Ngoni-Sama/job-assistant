import type { Env } from "../types";

/** Free credits granted to a new account on first use. */
export const FREE_CREDITS = 50;

/** Credit cost per AI action. Tune freely — these are deducted server-side. */
export const COSTS = {
  quickMatch: 10, // full batch analysis of all listings
  optimise: 3, // prepare/tailor one application
  matchAll: 5, // score all cached jobs
  unlockContact: 20, // employer reveals one candidate's contact details
} as const;

const key = (userId: string) => `credits:${userId}`;

export async function getCredits(env: Env, userId: string): Promise<number> {
  const raw = await env.JOBS_CACHE.get(key(userId));
  if (raw === null) {
    await env.JOBS_CACHE.put(key(userId), String(FREE_CREDITS));
    return FREE_CREDITS;
  }
  return Number(raw) || 0;
}

export async function addCredits(env: Env, userId: string, amount: number): Promise<number> {
  const balance = (await getCredits(env, userId)) + amount;
  await env.JOBS_CACHE.put(key(userId), String(balance));
  return balance;
}

/**
 * Attempt to spend credits. Returns { ok:false } without deducting when the
 * balance is insufficient, so callers can return a 402 and prompt a top-up.
 */
export async function charge(
  env: Env,
  userId: string,
  amount: number,
): Promise<{ ok: boolean; balance: number }> {
  const balance = await getCredits(env, userId);
  if (balance < amount) return { ok: false, balance };
  const next = balance - amount;
  await env.JOBS_CACHE.put(key(userId), String(next));
  return { ok: true, balance: next };
}
