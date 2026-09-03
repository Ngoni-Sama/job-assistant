import type { JobDetail } from "../../types";
import { parseExpiry } from "../utils/date";
import { fetchHtml, firstGroup, text } from "./shared";

/** Fetch a vacancymail job detail page and extract the "How to Apply" info. */
export async function fetchJobDetail(url: string): Promise<JobDetail> {
  return parseDetail(await fetchHtml(url));
}

/**
 * Detail markup (vacancymail, verified 2026-09-03):
 *   <div class="single-page-section">
 *     <h3>How to Apply</h3>
 *     <p>Interested candidates to send their CVs to EMAIL or PHONE before DATE</p>
 */
export function parseDetail(html: string): JobDetail {
  const applyText = text(
    firstGroup(html, /how to apply<\/h3>\s*([\s\S]*?)<\/div>/i),
  );

  // Full JD: content up to the "Similar Jobs" section, from the content column.
  const end = html.search(/Similar Jobs/i);
  const body = end > -1 ? html.slice(0, end) : html;
  const contentStart = body.search(/content-right-offset|single-page-section/i);
  const description = text(contentStart > -1 ? body.slice(contentStart) : body).slice(0, 4000);

  const applyEmail = firstMatch(applyText, /[\w.+-]+@[\w-]+\.[\w.-]+/);
  const applyPhone = cleanPhone(firstMatch(applyText, /(\+?\d[\d\s-]{7,}\d)/));
  const deadline = firstMatch(applyText, /before\s+(.+?)(?:\.|$)/i, 1)?.trim();

  return {
    description,
    applyText,
    applyEmail,
    applyPhone,
    deadline,
    deadlineDate: parseExpiry(deadline),
  };
}

function firstMatch(input: string, re: RegExp, group = 0): string | undefined {
  const m = input.match(re);
  return m ? m[group] : undefined;
}

function cleanPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const p = raw.replace(/\s+/g, " ").trim();
  // Require at least 9 digits to avoid matching stray number runs.
  return (p.match(/\d/g)?.length ?? 0) >= 9 ? p : undefined;
}
