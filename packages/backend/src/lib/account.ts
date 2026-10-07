import type { Env, Thread } from "../types";

/**
 * Account deletion, blocking and reporting — required for Google Play
 * (users must be able to delete their account and data, and to block and
 * report other users in chat).
 */

const blocksKey = (userId: string) => `blocks:${userId}`;
const REPORTS_KEY = "reports";
const MAX_REPORTS = 300;

/** The other person in a thread. */
export function otherParty(thread: Thread, userId: string): string {
  return thread.employerUserId === userId ? thread.candidateEmail : thread.employerUserId;
}

export async function getBlocks(env: Env, userId: string): Promise<string[]> {
  return (await env.JOBS_CACHE.get<string[]>(blocksKey(userId), "json")) ?? [];
}

/** Has `recipient` blocked `sender`? */
export async function isBlockedBy(env: Env, recipient: string, sender: string): Promise<boolean> {
  return (await getBlocks(env, recipient)).some((b) => b.toLowerCase() === sender.toLowerCase());
}

export async function setBlock(env: Env, userId: string, other: string, block: boolean): Promise<string[]> {
  const list = (await getBlocks(env, userId)).filter((b) => b.toLowerCase() !== other.toLowerCase());
  if (block) list.push(other);
  await env.JOBS_CACHE.put(blocksKey(userId), JSON.stringify(list));
  return list;
}

export type Report = {
  id: string;
  threadId: string;
  reporter: string;
  reported: string;
  reason: string;
  details: string;
  /** The last few messages, so a moderator can judge without opening the thread. */
  excerpt: { from: string; text: string; at: string }[];
  at: string;
  status: "open" | "resolved";
  resolution?: string;
};

export async function listReports(env: Env): Promise<Report[]> {
  return (await env.JOBS_CACHE.get<Report[]>(REPORTS_KEY, "json")) ?? [];
}

export async function addReport(env: Env, r: Omit<Report, "id" | "at" | "status">): Promise<Report> {
  const report: Report = { ...r, id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), status: "open" };
  const all = await listReports(env);
  all.unshift(report);
  await env.JOBS_CACHE.put(REPORTS_KEY, JSON.stringify(all.slice(0, MAX_REPORTS)));
  return report;
}

export async function resolveReport(env: Env, id: string, resolution: string): Promise<Report[]> {
  const all = (await listReports(env)).map((r) => (r.id === id ? { ...r, status: "resolved" as const, resolution } : r));
  await env.JOBS_CACHE.put(REPORTS_KEY, JSON.stringify(all));
  return all;
}

/** Delete one thread and take it off both people's inbox lists. */
export async function deleteThread(env: Env, threadId: string): Promise<void> {
  const t = await env.JOBS_CACHE.get<Thread>(`thread:${threadId}`, "json");
  if (t) {
    for (const [listKey] of [[`empthreads:${t.employerUserId}`], [`candthreads:${t.candidateEmail}`]]) {
      const ids = (await env.JOBS_CACHE.get<string[]>(listKey, "json")) ?? [];
      if (ids.includes(threadId)) await env.JOBS_CACHE.put(listKey, JSON.stringify(ids.filter((i) => i !== threadId)));
    }
  }
  await env.JOBS_CACHE.delete(`thread:${threadId}`);
  await env.JOBS_CACHE.delete(`threadread:${threadId}`);
}

/** Every key under a prefix (KV lists 1000 at a time). */
async function keysWithPrefix(env: Env, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.JOBS_CACHE.list({ prefix, cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

/**
 * Permanently delete everything stored about a user: profile, CVs (and the
 * uploaded files), applications, settings, credits, notification devices,
 * Google sign-in tokens, employer account, conversations, search index entries.
 * Payment records are kept (required for accounting) but hold no profile data.
 */
export async function deleteAccount(env: Env, userId: string, candidateId: string): Promise<{ deleted: number }> {
  let deleted = 0;
  const del = async (key: string) => {
    await env.JOBS_CACHE.delete(key);
    deleted++;
  };

  // Conversations first (they're listed in keys deleted below).
  const threadIds = new Set([
    ...((await env.JOBS_CACHE.get<string[]>(`empthreads:${userId}`, "json")) ?? []),
    ...((await env.JOBS_CACHE.get<string[]>(`candthreads:${userId}`, "json")) ?? []),
  ]);
  for (const id of threadIds) {
    await deleteThread(env, id);
    deleted++;
  }

  // Single keys — exact names (a prefix would also match other emails starting the same way).
  const exact = [
    "profile", "prefs", "cv", "cvs", "cvfile", "checks", "seen", "employer", "employerdoc", "empthreads",
    "candthreads", "applied", "quickmatch", "autoapply", "unread", "shortlist", "unlocked", "rcv", "gtoken",
    "credits", "blocks", "notify", "pushsubs",
  ].map((p) => `${p}:${userId}`);
  for (const k of exact) await del(k);

  // Multi-key families end in ":" so they only match this user.
  for (const prefix of [`cvfile:${userId}:`, `application:${userId}:`, `cvq:${userId}:`, `emb:${candidateId}:`]) {
    for (const k of await keysWithPrefix(env, prefix)) await del(k);
  }
  await del(`cidmap:${candidateId}`);

  // Talent search index + stored CV files.
  if (env.VECTORIZE) {
    try {
      await env.VECTORIZE.deleteByIds([candidateId]);
    } catch (err) {
      console.error("vector delete failed", err);
    }
  }
  if (env.CV_BUCKET) {
    let cursor: string | undefined;
    do {
      const page = await env.CV_BUCKET.list({ prefix: `cvs/${userId}/`, cursor });
      if (page.objects.length) await env.CV_BUCKET.delete(page.objects.map((o) => o.key));
      deleted += page.objects.length;
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  // Remember (as a one-way hash, not the email) that this account was deleted,
  // so signing up again doesn't hand out the welcome credits a second time.
  await env.JOBS_CACHE.put(`deletedacct:${await sha256(userId.toLowerCase())}`, new Date().toISOString());
  return { deleted };
}

export async function sha256(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
