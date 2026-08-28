import type { JobListing, JobScore, StoredCV } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

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

export const api = {
  getJobs: () => req<{ jobs: JobListing[] }>("/api/jobs"),
  scrape: () => req<{ count: number; jobs: JobListing[] }>("/api/scrape", { method: "POST" }),
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
};
