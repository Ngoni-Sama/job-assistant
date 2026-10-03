import type { Prefs, Profile } from "../types";

/**
 * Job-alert matching: which brand-new jobs fit a user. Matches on the main
 * profession first, then other roles, sectors and auto-apply keywords.
 */

export type SlimJob = { id: string; title: string; company: string; sector?: string };

const STOP_WORDS = new Set(["and", "the", "for", "with", "of", "in", "senior", "junior", "assistant", "officer"]);

/** Meaningful words of a role or job title ("HR", "IT", "QA" count). */
function roleWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * "Nurse" ~ "Nursing", "Accountant" ~ "Accounting": same first 4 letters.
 * Short words ("HR", "IT", "QA") must match exactly.
 */
function sameStem(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.slice(0, 4) === b.slice(0, 4);
}

/** Does a job title fit a role? Every meaningful word of the role must appear. */
export function roleMatches(role: string, title: string): boolean {
  const want = roleWords(role);
  if (!want.length) return false;
  const have = roleWords(title);
  return want.every((w) => have.some((h) => sameStem(w, h)));
}

/** New jobs that fit a user: `main` = their main profession, `other` = the rest. */
export function jobsForUser(jobs: SlimJob[], profile: Profile, prefs: Prefs): { main: SlimJob[]; other: SlimJob[] } {
  const sectors = new Set([profile.sector, ...(prefs.autoApplySectors ?? [])].filter((x) => x && x !== "Other"));
  const keywords = (prefs.autoApplyKeywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const roles = profile.otherRoles ?? [];
  const main: SlimJob[] = [];
  const other: SlimJob[] = [];
  for (const j of jobs) {
    if (profile.mainProfession && roleMatches(profile.mainProfession, j.title)) main.push(j);
    else if (
      roles.some((r) => roleMatches(r, j.title)) ||
      (!!j.sector && sectors.has(j.sector)) ||
      keywords.some((k) => j.title.toLowerCase().includes(k))
    ) {
      other.push(j);
    }
  }
  return { main, other };
}

/** The notification for a user's matches (null when nothing fits). */
export function jobAlertText(
  main: SlimJob[],
  other: SlimJob[],
  mainProfession: string | undefined,
): { title: string; body: string; url: string } | null {
  const all = [...main, ...other];
  const n = all.length;
  if (!n) return null;
  const title = main.length
    ? n === 1
      ? `New ${mainProfession} job`
      : main.length === n
        ? `${n} new ${mainProfession} jobs`
        : `${n} new jobs for you — ${main.length} for ${mainProfession}`
    : n === 1
      ? "New job for you"
      : `${n} new jobs for you`;
  const lines = all.slice(0, 2).map((j) => (j.company && j.company !== "N/A" ? `${j.title} — ${j.company}` : j.title));
  return {
    title,
    body: lines.join(" · ") + (n > 2 ? ` and ${n - 2} more` : ""),
    url: n === 1 ? `/jobs/${encodeURIComponent(all[0].id)}` : "/dashboard",
  };
}
