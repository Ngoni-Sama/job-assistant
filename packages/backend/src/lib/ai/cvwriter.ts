import type { Env, JobDetail, JobListing } from "../../types";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export interface TailoredApplication {
  summary: string; // tailored professional summary added on top of the CV
  coverNote: string; // short cover message for the application email
  tailoredCV: string; // summary + the user's original CV
}

/**
 * Tailor the user's CV to a specific job: generate a role-targeted professional
 * summary and a short cover note, then prepend the summary to the existing CV
 * ("add on top of what I already have"). Falls back gracefully if the model
 * returns unparseable output — the original CV is always preserved.
 */
export async function tailorApplication(
  cvMarkdown: string,
  job: JobListing,
  detail: JobDetail,
  env: Env,
): Promise<TailoredApplication> {
  const system =
    "You are a professional CV writer. Given a candidate's CV and a job, return " +
    "ONLY compact JSON: {\"summary\": string, \"coverNote\": string}. " +
    "`summary` is a 3-4 sentence professional summary rewritten to target THIS job, " +
    "using only facts present in the CV (never invent qualifications). " +
    "`coverNote` is a short, warm 3-4 sentence application message addressed to the hiring team.";

  const user = [
    "=== JOB ===",
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Requirements/Description:\n${truncate(detail.description || job.description, 2500)}`,
    "",
    "=== CANDIDATE CV ===",
    truncate(cvMarkdown, 3500),
  ].join("\n");

  let raw = "";
  try {
    const res = (await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 600,
    })) as { response?: string };
    raw = res.response ?? "";
  } catch (err) {
    console.error("cvwriter AI.run failed", err);
  }

  const { summary, coverNote } = parse(raw, job);
  const tailoredCV = `## Professional Summary — tailored for ${job.title}\n\n${summary}\n\n---\n\n${cvMarkdown}`;
  return { summary, coverNote, tailoredCV };
}

function parse(raw: string, job: JobListing): { summary: string; coverNote: string } {
  const fallback = {
    summary: "Experienced candidate applying for this role (see CV below).",
    coverNote: `Dear Hiring Team,\n\nPlease find my CV attached for the ${job.title} position at ${job.company}. I believe my background is a strong fit and would welcome the chance to discuss it.\n\nKind regards.`,
  };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return fallback;
  try {
    const p = JSON.parse(raw.slice(start, end + 1));
    return {
      summary: String(p.summary ?? fallback.summary),
      coverNote: String(p.coverNote ?? fallback.coverNote),
    };
  } catch {
    return fallback;
  }
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
