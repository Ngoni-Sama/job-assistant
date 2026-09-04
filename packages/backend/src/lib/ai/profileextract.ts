import type { Env, Profile } from "../../types";
import { chat } from "./provider";

/**
 * Extract structured candidate profile fields from a CV using AI. Only facts
 * present in the CV are used; anything unparseable is simply omitted so the
 * caller can merge over the existing profile.
 */
export async function extractProfile(cvMarkdown: string, env: Env): Promise<Partial<Profile>> {
  const system =
    "You extract a candidate profile from a CV. Return ONLY JSON: " +
    '{"name": string, "headline": string (one line, e.g. "Registered Nurse · 5 yrs · Harare"), ' +
    '"sector": string, "location": string, "yearsExperience": number, "skills": string[] (max 10), ' +
    '"education": string (highest qualification), "languages": string[]}. ' +
    "Use only facts present in the CV. Omit a field if unknown. No prose.";

  let raw = "";
  try {
    raw = await chat(
      env,
      [
        { role: "system", content: system },
        { role: "user", content: truncate(cvMarkdown, 4000) },
      ],
      500,
    );
  } catch (err) {
    console.error("extractProfile chat failed", err);
    return {};
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    const p = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const out: Partial<Profile> = {};
    if (typeof p.name === "string") out.name = p.name.slice(0, 80);
    if (typeof p.headline === "string") out.headline = p.headline.slice(0, 120);
    if (typeof p.sector === "string") out.sector = p.sector.slice(0, 60);
    if (typeof p.location === "string") out.location = p.location.slice(0, 60);
    if (Number.isFinite(Number(p.yearsExperience))) out.yearsExperience = Math.round(Number(p.yearsExperience));
    if (Array.isArray(p.skills)) out.skills = p.skills.map(String).slice(0, 10);
    if (typeof p.education === "string") out.education = p.education.slice(0, 120);
    if (Array.isArray(p.languages)) out.languages = p.languages.map(String).slice(0, 8);
    return out;
  } catch {
    return {};
  }
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
