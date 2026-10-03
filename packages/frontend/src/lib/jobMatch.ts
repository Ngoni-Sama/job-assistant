import type { JobListing, Prefs, Profile } from "./types";

/**
 * Which jobs fit a user's profile — the same rules the server uses for job
 * alerts (packages/backend/src/lib/alerts.ts): main profession first, then
 * other roles, sectors and auto-apply keywords.
 */

const STOP_WORDS = new Set(["and", "the", "for", "with", "of", "in", "senior", "junior", "assistant", "officer"]);

function roleWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** "Nurse" ~ "Nursing": same first 4 letters; short words ("HR", "IT") must match exactly. */
function sameStem(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.slice(0, 4) === b.slice(0, 4);
}

export function roleMatches(role: string, title: string): boolean {
  const want = roleWords(role);
  if (!want.length) return false;
  const have = roleWords(title);
  return want.every((w) => have.some((h) => sameStem(w, h)));
}

export type ProfileTargets = {
  mainProfession?: string;
  roles: string[];
  sectors: string[];
  keywords: string[];
};

/** What "jobs for me" looks for, from the profile + auto-apply settings. */
export function profileTargets(profile: Profile | null, prefs: Prefs | null): ProfileTargets {
  return {
    mainProfession: profile?.mainProfession?.trim() || undefined,
    roles: (profile?.otherRoles ?? []).filter(Boolean),
    sectors: [...new Set([profile?.sector, ...(prefs?.autoApplySectors ?? [])])].filter(
      (s): s is string => !!s && s !== "Other",
    ),
    keywords: (prefs?.autoApplyKeywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean),
  };
}

export function hasTargets(t: ProfileTargets): boolean {
  return !!t.mainProfession || t.roles.length > 0 || t.sectors.length > 0 || t.keywords.length > 0;
}

/** 2 = main profession, 1 = other role / sector / keyword, 0 = no match. */
export function matchScore(job: JobListing, t: ProfileTargets): number {
  if (t.mainProfession && roleMatches(t.mainProfession, job.title)) return 2;
  if (t.roles.some((r) => roleMatches(r, job.title))) return 1;
  if (job.sector && t.sectors.includes(job.sector)) return 1;
  const title = job.title.toLowerCase();
  if (t.keywords.some((k) => title.includes(k))) return 1;
  return 0;
}
