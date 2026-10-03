import type { Env } from "../../types";
import { docChat, getConfig, promptFor } from "./provider";

/**
 * ATS CV writer. The user's facts (roles, employers, dates, education) are
 * never handed back to the AI to rewrite — it only writes the headline,
 * summary, achievement bullets and skill order. Then a guardrail in code (not
 * just in the prompt) drops anything that isn't backed by the user's input:
 * numbers/metrics they never gave and skills they never mentioned.
 */

export type AtsCvInput = {
  targetRole?: string;
  jobDescription?: string;
  headline?: string;
  summary?: string;
  experience: { role: string; company: string; start?: string; end?: string; details: string }[];
  education: { qualification: string; institution: string; year?: string }[];
  skills: string[];
  certifications: string[];
  languages?: string;
};

export type AtsCvOutput = {
  headline: string;
  summary: string;
  /** Bullets per role, same order as the input. */
  experience: { bullets: string[] }[];
  skills: string[];
  /** How many AI suggestions the guardrail removed (shown to the user). */
  removed: number;
};

const MAX_BULLETS = 6;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);
const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);

/** Numbers/metrics in a text, normalised ("1,200" → "1200", "45 %" → "45%"). */
function numbers(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?\s*%?/g) ?? []).map((n) => n.replace(/[,\s]/g, ""));
}

/** Every number in `text` also appears somewhere in the user's own words. */
function numbersBacked(text: string, source: Set<string>): boolean {
  return numbers(text).every((n) => source.has(n) || source.has(n.replace("%", "")));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();

export function guardOutput(input: AtsCvInput, raw: unknown): AtsCvOutput {
  const r = (raw ?? {}) as {
    headline?: unknown;
    summary?: unknown;
    experience?: { i?: unknown; bullets?: unknown }[];
    skills?: unknown;
  };
  const allUserText = [
    input.headline,
    input.summary,
    input.targetRole,
    ...input.experience.flatMap((e) => [e.role, e.company, e.details]),
    ...input.education.flatMap((e) => [e.qualification, e.institution]),
    ...input.skills,
    ...input.certifications,
    input.languages,
  ]
    .filter(Boolean)
    .join("\n");
  const userNumbers = new Set(numbers(allUserText).flatMap((n) => [n, n.replace("%", "")]));
  let removed = 0;

  // Headline + summary: any invented metric → fall back to the user's own.
  let headline = typeof r.headline === "string" ? clip(r.headline.trim(), 90) : "";
  if (!headline || !numbersBacked(headline, userNumbers)) {
    if (headline) removed++;
    headline = (input.headline || input.targetRole || "").trim();
  }
  let summary = typeof r.summary === "string" ? clip(r.summary.trim(), 900) : "";
  if (!summary || !numbersBacked(summary, userNumbers)) {
    if (summary) removed++;
    summary = (input.summary ?? "").trim();
  }

  // Bullets per role: keep only those whose numbers come from THAT role's details.
  const byIndex = new Map<number, unknown>();
  for (const item of Array.isArray(r.experience) ? r.experience : []) {
    if (typeof item?.i === "number") byIndex.set(item.i, item.bullets);
  }
  const experience = input.experience.map((role, i) => {
    const original = lines(role.details);
    const roleNumbers = new Set(numbers(`${role.details}\n${role.role}`).flatMap((n) => [n, n.replace("%", "")]));
    const proposed = byIndex.get(i);
    const kept = (Array.isArray(proposed) ? proposed : [])
      .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      .map((b) => clip(b.replace(/^\s*[-*•]\s*/, "").trim(), 240))
      .filter((b) => {
        const ok = numbersBacked(b, roleNumbers);
        if (!ok) removed++;
        return ok;
      })
      .slice(0, MAX_BULLETS);
    // Nothing usable from the AI → keep what the user wrote.
    return { bullets: kept.length ? kept : original.slice(0, MAX_BULLETS) };
  });

  // Skills: only ones the user actually mentioned (the AI may reorder/rename).
  const userTextNorm = ` ${norm(allUserText)} `;
  const proposedSkills = Array.isArray(r.skills) ? r.skills.filter((s): s is string => typeof s === "string") : [];
  const skills: string[] = [];
  for (const s of proposedSkills) {
    const n = norm(s);
    if (!n) continue;
    const backed = userTextNorm.includes(` ${n} `) || input.skills.some((u) => norm(u) === n || norm(u).includes(n) || n.includes(norm(u)));
    if (backed) {
      if (!skills.some((k) => norm(k) === n)) skills.push(clip(s.trim(), 60));
    } else removed++;
  }
  for (const s of input.skills) if (!skills.some((k) => norm(k) === norm(s))) skills.push(s); // never lose theirs

  return { headline, summary, experience, skills: skills.slice(0, 20), removed };
}

/** Write an ATS-friendly CV from the user's details. Throws if the AI fails. */
export async function writeAtsCv(env: Env, input: AtsCvInput): Promise<AtsCvOutput> {
  const system =
    promptFor(await getConfig(env), "atsCv") +
    "\n\nRules you must follow: use ONLY facts in the candidate's details. Never add employers, job titles, " +
    "dates, qualifications, certifications, numbers or skills they did not give. Return ONLY JSON: " +
    '{"headline": string, "summary": string, "experience": [{"i": number, "bullets": string[]}], ' +
    '"skills": string[]} — one "experience" item per role, using the role\'s index "i", with 3-5 bullets ' +
    "per role; every bullet is a full sentence of 12-25 words (action verb + what they did + scale or result), " +
    "never a short fragment. No prose outside the JSON.";

  const user = JSON.stringify({
    targetRole: input.targetRole || undefined,
    jobAdvert: input.jobDescription ? clip(input.jobDescription, 5000) : undefined,
    candidate: {
      headline: input.headline,
      summary: input.summary,
      roles: input.experience.map((e, i) => ({ i, role: e.role, company: e.company, period: [e.start, e.end].filter(Boolean).join(" – "), whatTheyDid: lines(e.details) })),
      education: input.education,
      skills: input.skills,
      certifications: input.certifications,
      languages: input.languages,
    },
  });

  const raw = await docChat(
    env,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    1400,
    true,
  );
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI didn't return a CV");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return guardOutput(input, parsed);
}
