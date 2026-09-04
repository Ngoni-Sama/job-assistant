import type { Env, JobListing } from "../../types";
import { chat } from "./provider";

export interface QuickMatchResult {
  jobId: string;
  title: string;
  company: string;
  location: string;
  score: number;
  reason: string;
}

export interface QuickMatchRun {
  id: string;
  createdAt: string;
  analyzedCount: number;
  results: QuickMatchResult[];
}

const BATCH = 25; // jobs per AI call — keeps prompts within context
const MAX_JOBS = 100; // bound cost/time per run
const MIN_SCORE = 60; // "strong fit" threshold

/**
 * Analyse the candidate's CV against the current listings and return the jobs
 * they're a strong fit for. Jobs are chunked into batches so the whole set can
 * be evaluated in a handful of AI calls rather than one-per-job.
 */
export async function quickMatch(
  cvMarkdown: string,
  jobs: JobListing[],
  env: Env,
): Promise<QuickMatchRun> {
  const pool = jobs.slice(0, MAX_JOBS);
  const results: QuickMatchResult[] = [];

  for (let start = 0; start < pool.length; start += BATCH) {
    const batch = pool.slice(start, start + BATCH);
    try {
      results.push(...(await scoreBatch(cvMarkdown, batch, env)));
    } catch (err) {
      console.error("quickMatch batch failed", err);
    }
  }

  results.sort((a, b) => b.score - a.score);
  return {
    id: `qm-${Date.now()}`,
    createdAt: new Date().toISOString(),
    analyzedCount: pool.length,
    results,
  };
}

async function scoreBatch(
  cv: string,
  batch: JobListing[],
  env: Env,
): Promise<QuickMatchResult[]> {
  const system =
    "You are a career advisor. Given a candidate CV and a numbered list of jobs, " +
    "identify ONLY the jobs the candidate is a STRONG fit for and has a realistic " +
    'chance of qualifying for. Return ONLY a JSON array: [{"i": number, "score": ' +
    '0-100, "reason": "one short sentence"}]. Include an item only if score >= 60. No prose.';

  const list = batch
    .map(
      (j, i) =>
        `${i + 1}. ${j.title} — ${j.company} (${j.sector ?? "General"}) | ${truncate(j.description, 140)}`,
    )
    .join("\n");

  const user = `=== CANDIDATE CV ===\n${truncate(cv, 2500)}\n\n=== JOBS ===\n${list}`;

  const raw = await chat(
    env,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    1500,
  );

  return parseBatch(raw, batch);
}

function parseBatch(raw: string, batch: JobListing[]): QuickMatchResult[] {
  let items: unknown[] = [];
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      /* fall through to object salvage */
    }
  }
  // Salvage complete {...} objects when the array was truncated (token limit).
  if (items.length === 0) {
    for (const m of raw.match(/\{[^{}]*\}/g) ?? []) {
      try {
        items.push(JSON.parse(m));
      } catch {
        /* skip malformed */
      }
    }
  }

  const out: QuickMatchResult[] = [];
  for (const item of items) {
    const idx = Number((item as { i?: number }).i) - 1;
    const job = batch[idx];
    const score = Math.max(0, Math.min(100, Math.round(Number((item as { score?: number }).score) || 0)));
    if (!job || score < MIN_SCORE) continue;
    out.push({
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      score,
      reason: String((item as { reason?: string }).reason ?? "Strong match for your background."),
    });
  }
  return out;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
