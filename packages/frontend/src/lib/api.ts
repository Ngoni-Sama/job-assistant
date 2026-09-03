import type {
  Application,
  JobListing,
  JobScore,
  Prefs,
  ScrapeSource,
  ScrapeStats,
  SendResult,
  StoredCV,
} from "./types";

// Defaults to the live Worker so the deployed frontend works without extra
// config. For local dev, set NEXT_PUBLIC_API_URL=http://localhost:8787.
const FALLBACK_API = "https://job-assistant.ma360-ngoni.workers.dev";

/**
 * Normalise the configured API base. Guards the common misconfiguration of
 * setting NEXT_PUBLIC_API_URL without a scheme (e.g. "job-assistant.…workers.dev"),
 * which the browser would otherwise treat as a path relative to the current
 * origin — producing 404s like vercel.app/job-assistant.…/api/upload-cv.
 */
function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return FALLBACK_API;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, ""); // drop trailing slash
}

export const apiBase = normalizeBase(process.env.NEXT_PUBLIC_API_URL);
const BASE = apiBase;

// Demo single-user id; swap for real auth (NextAuth) in production.
const USER_ID = "demo";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-user-id": USER_ID, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const jsonBody = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const api = {
  getJobs: () => req<{ jobs: JobListing[]; stats: ScrapeStats | null }>("/api/jobs"),
  scrape: () =>
    req<{ count: number; jobs: JobListing[]; stats: ScrapeStats }>("/api/scrape", {
      method: "POST",
    }),
  getCV: () => req<{ cv: StoredCV | null }>("/api/cv"),
  matchAll: () => req<{ scores: JobScore[] }>("/api/match-all", { method: "POST" }),
  uploadCV: (file: File) => {
    const form = new FormData();
    form.append("cv", file);
    return req<{ success: boolean; cv: StoredCV }>("/api/upload-cv", {
      method: "POST",
      body: form,
    });
  },
  getPrefs: () => req<{ prefs: Prefs }>("/api/prefs"),
  setPrefs: (prefs: Partial<Prefs>) => req<{ prefs: Prefs }>("/api/prefs", jsonBody(prefs)),
  getApplied: () => req<{ applied: string[] }>("/api/applied"),
  prepareApplication: (jobId: string) =>
    req<{ application: Application; autoSent: SendResult | null }>(
      "/api/apply/prepare",
      jsonBody({ jobId }),
    ),
  sendApplication: (jobId: string) =>
    req<{ result: SendResult }>("/api/apply/send", jsonBody({ jobId })),
  getSources: () => req<{ sources: ScrapeSource[] }>("/api/sources"),
  addSource: (url: string, label?: string) =>
    req<{ sources: ScrapeSource[]; supported: boolean }>("/api/sources", jsonBody({ url, label })),
  removeSource: (url: string) =>
    req<{ sources: ScrapeSource[] }>("/api/sources", {
      ...jsonBody({ url }),
      method: "DELETE",
    }),
};
