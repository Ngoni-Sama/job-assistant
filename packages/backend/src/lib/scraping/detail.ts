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
  const applyText = text(firstGroup(html, /how to apply<\/h3>\s*([\s\S]*?)<\/div>/i))
    .replace(/\*\*/g, "")
    .trim();

  // Full JD: content up to the "Similar Jobs" section, from the content column.
  const end = html.search(/Similar Jobs/i);
  const body = end > -1 ? html.slice(0, end) : html;
  const contentStart = body.search(/content-right-offset|single-page-section/i);
  const description = text(contentStart > -1 ? body.slice(contentStart) : body).slice(0, 4000);

  const applyEmail = firstMatch(applyText, /[\w.+-]+@[\w-]+\.[\w.-]+/);
  const applyPhone = cleanPhone(firstMatch(applyText, /(\+?\d[\d\s-]{7,}\d)/));
  const deadline = firstMatch(applyText, /before\s+(.+?)(?:\.|$)/i, 1)?.trim();

  const logoSrc = firstMatch(html, /class="[^"]*single-page-image[^"]*"[\s\S]*?<img[^>]*src="([^"]+)"/i, 1) ||
    firstMatch(html, /<img[^>]*src="(\/media\/logo[^"]+)"/i, 1);
  const logo = logoSrc ? (logoSrc.startsWith("http") ? logoSrc : `https://vacancymail.co.zw${logoSrc}`) : undefined;

  return {
    description,
    applyText,
    applyEmail,
    applyPhone,
    deadline,
    deadlineDate: parseExpiry(deadline),
    logo,
    sections: extractSections(html),
  };
}

/** Extract the standard vacancymail sections by their h3 headings. */
function extractSections(html: string): JobDetail["sections"] {
  const end = html.search(/Similar Jobs/i);
  const body = end > -1 ? html.slice(0, end) : html;
  const map: [keyof NonNullable<JobDetail["sections"]>, string][] = [
    ["jobDescription", "Job Description"],
    ["duties", "Duties and Responsibilities"],
    ["qualifications", "Qualifications and Experience"],
    ["howToApply", "How to Apply"],
  ];
  const found = map
    .map(([key, heading]) => ({
      key,
      idx: body.search(new RegExp(`<h[23][^>]*>\\s*${heading}`, "i")),
    }))
    .filter((x) => x.idx > -1)
    .sort((a, b) => a.idx - b.idx);

  const sections: NonNullable<JobDetail["sections"]> = {};
  for (let i = 0; i < found.length; i++) {
    const startTag = body.indexOf("</h", found[i].idx);
    const start = body.indexOf(">", startTag) + 1;
    const hardStop = i + 1 < found.length ? found[i + 1].idx : body.length;
    let rest = body.slice(start, hardStop);
    // Trim inter-section junk (the next section block, apply widgets, forms)
    // so a section only contains its own content.
    const cuts = [
      /<div[^>]*class="[^"]*single-page-section/i,
      /apply for this job|share this job|report this|<form/i,
    ]
      .map((re) => rest.search(re))
      .filter((x) => x > -1);
    if (cuts.length) rest = rest.slice(0, Math.min(...cuts));
    sections[found[i].key] = text(rest).replace(/\*\*/g, "").trim();
  }
  return sections;
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
