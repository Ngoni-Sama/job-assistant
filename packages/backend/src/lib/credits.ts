import type { Env } from "../types";
import { DEFAULT_COSTS, getConfig, type ActionCosts } from "./ai/provider";
import { sha256 } from "./account";

/** Default free credits for a new account (admin can override in settings). */
export const FREE_CREDITS = 50;

/** Built-in credit prices (admins can change them in Admin → AI & Pricing). */
export const COSTS = DEFAULT_COSTS;

/** Current credit price per paid action, as set by the admin. */
export async function getCosts(env: Env): Promise<ActionCosts> {
  return (await getConfig(env)).costs;
}

const key = (userId: string) => `credits:${userId}`;

export async function getCredits(env: Env, userId: string): Promise<number> {
  const raw = await env.JOBS_CACHE.get(key(userId));
  if (raw === null) {
    // A re-created account (the old one was deleted) doesn't get the welcome credits twice.
    const wasDeleted = userId !== "demo" && (await env.JOBS_CACHE.get(`deletedacct:${await sha256(userId.toLowerCase())}`)) !== null;
    const free = wasDeleted ? 0 : ((await getConfig(env)).payments.freeCredits ?? FREE_CREDITS);
    await env.JOBS_CACHE.put(key(userId), String(free));
    return free;
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
