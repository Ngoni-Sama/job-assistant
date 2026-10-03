import type { Env } from "../../types";
import { docChat, getConfig, promptFor } from "./provider";

/**
 * CV interview: for one job the user has done, ask a few short follow-up
 * questions that draw out concrete achievements and numbers, and suggest
 * skills people in that role usually have. Suggestions are only shown as
 * chips — the user ticks the ones that are true; nothing is added for them.
 */

export type InterviewInput = {
  targetRole?: string;
  role: string;
  company?: string;
  details?: string;
};

export type InterviewOutput = { questions: string[]; skills: string[] };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

export function cleanInterview(raw: unknown): InterviewOutput {
  const r = (raw ?? {}) as { questions?: unknown; skills?: unknown };
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .filter((q): q is string => typeof q === "string")
    .map((q) => clip(q.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim(), 180))
    .filter((q) => q.length > 8)
    .map((q) => (/[?]$/.test(q) ? q : `${q.replace(/[.!]+$/, "")}?`))
    .slice(0, 4);
  const seen = new Set<string>();
  const skills = (Array.isArray(r.skills) ? r.skills : [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => clip(s.trim(), 50))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 8);
  return { questions, skills };
}

export async function interviewQuestions(env: Env, input: InterviewInput): Promise<InterviewOutput> {
  const system =
    promptFor(await getConfig(env), "cvQuestions") +
    '\n\nReturn ONLY JSON: {"questions": string[], "skills": string[]} — 3 or 4 questions, up to 8 skills. No prose.';
  const user = JSON.stringify({
    jobTheyWant: input.targetRole || undefined,
    jobTheyDid: input.role,
    company: input.company || undefined,
    whatTheyWrote: input.details ? clip(input.details, 2000) : undefined,
  });
  const raw = await docChat(
    env,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    500,
    true,
  );
  const out = cleanInterview(parseLoose(raw));
  if (!out.questions.length) {
    console.error("CV interview: unusable AI reply", raw.slice(0, 300));
    throw new Error("The AI didn't return questions");
  }
  return out;
}

/**
 * Models don't always follow the format: accept the JSON object, a bare JSON
 * array of questions, or plain numbered/bulleted lines ending in "?".
 */
export function parseLoose(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  const a = raw.indexOf("[");
  const b = raw.lastIndexOf("]");
  if (a !== -1 && b > a) {
    try {
      const arr = JSON.parse(raw.slice(a, b + 1));
      if (Array.isArray(arr)) return { questions: arr, skills: [] };
    } catch {
      /* fall through */
    }
  }
  const questions = raw
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter((l) => l.endsWith("?"));
  return { questions, skills: [] };
}
