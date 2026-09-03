import type { Env, JobListing, JobScore } from "../../types";
import { chat } from "./provider";

/** Scores a single job against the CV markdown and returns a structured result. */
export async function matchJobToCV(
  cvMarkdown: string,
  job: JobListing,
  env: Env,
): Promise<JobScore> {
  const system =
    "You are an expert technical recruiter. Compare a candidate CV to a job and " +
    "return ONLY compact JSON with keys: score (0-100 integer), matchedSkills " +
    "(string[]), missingSkills (string[]), summary (one sentence). No prose.";

  const user = [
    "=== CANDIDATE CV ===",
    truncate(cvMarkdown, 4000),
    "",
    "=== JOB ===",
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
    `Description: ${truncate(job.description, 1500)}`,
    job.requirements.length ? `Requirements:\n- ${job.requirements.join("\n- ")}` : "",
  ].join("\n");

  let raw = "";
  try {
    raw = await chat(
      env,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      512,
    );
  } catch (err) {
    console.error("matcher chat failed", err);
  }

  return normalize(raw, job.id);
}

/** Robustly pull JSON out of the model response, with safe defaults. */
function normalize(raw: string, jobId: string): JobScore {
  const fallback: JobScore = {
    jobId,
    score: 0,
    matchedSkills: [],
    missingSkills: [],
    summary: "Could not evaluate match.",
  };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return fallback;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      jobId,
      score: clamp(Number(parsed.score) || 0),
      matchedSkills: toStringArray(parsed.matchedSkills),
      missingSkills: toStringArray(parsed.missingSkills),
      summary: String(parsed.summary ?? fallback.summary),
    };
  } catch {
    return fallback;
  }
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).slice(0, 12) : [];
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
