import type { JobDetail } from "../../types";
import { parseExpiry } from "../utils/date";
import { fetchHtml, firstGroup, text, htmlToText, scrubBoilerplate } from "./shared";

type Sections = NonNullable<JobDetail["sections"]>;

/** Fetch a job's source page and extract the detail sections for its site. */
export async function fetchJobDetail(url: string): Promise<JobDetail> {
  const html = await fetchHtml(url);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* relative/invalid url — fall through to the default parser */
  }
  if (host.includes("jobszimbabwe")) {
    const jz = parseJobPostingDetail(html);
    if (jz) return jz;
  }
  return parseDetail(html);
}

// ─────────────────────────────────────────────────────────────────────────────
// jobszimbabwe (and any page with a schema.org JobPosting)
// ─────────────────────────────────────────────────────────────────────────────

type JobPosting = {
  description?: string;
  validThrough?: string;
  image?: string | { url?: string };
  hiringOrganization?: { name?: string; logo?: string | { url?: string } };
};

/** Find the schema.org JobPosting in the page's JSON-LD blocks. */
function findJobPosting(html: string): JobPosting | null {
  const blocks = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      try {
        // Some sites put raw newlines inside JSON strings — tolerate them.
        data = JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, " "));
      } catch {
        continue;
      }
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) queue.push(...node);
      else if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        const t = o["@type"];
        if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return o as JobPosting;
        if (Array.isArray(o["@graph"])) queue.push(...(o["@graph"] as unknown[]));
      }
    }
  }
  return null;
}

/** Map a section heading to one of our detail sections (null = skip it). */
function sectionFor(heading: string): keyof Sections | "summary" | null {
  const h = heading.toLowerCase();
  if (/summary|overview/.test(h)) return "summary";
  if (/responsibilit|duties|key tasks|what you.?ll do|role/.test(h)) return "duties";
  if (/requirement|qualification|experience|skills|competenc|who we/.test(h)) return "qualifications";
  if (/how to apply|application|to apply/.test(h)) return "howToApply";
  if (/about/.test(h)) return "about";
  return null;
}

/**
 * Build clean detail cards from a JobPosting's description HTML: the intro is the
 * job description, and each <h2>/<h3>/<h4> heading starts a section. The
 * "Job Summary" facts (employer, type, location, closing date) are already shown
 * in the page header, so they're skipped here.
 */
export function parseJobPostingDetail(html: string): JobDetail | null {
  const posting = findJobPosting(html);
  if (!posting?.description) return null;

  const desc = posting.description;
  const parts = desc.split(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i);
  // parts = [intro, heading1, body1, heading2, body2, …]
  const sections: Sections = {};
  const intro = htmlToText(parts[0] ?? "");
  const extra: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = text(parts[i]);
    const body = htmlToText(parts[i + 1] ?? "");
    if (!body) continue;
    const key = sectionFor(heading);
    if (key === "summary") continue;
    if (key && !sections[key]) sections[key] = body;
    else if (key) sections[key] = `${sections[key]}\n${body}`;
    else extra.push(`${heading}\n${body}`);
  }
  const jobDescription = [intro, ...extra].filter(Boolean).join("\n");
  if (jobDescription) sections.jobDescription = jobDescription;

  // "About the Company" lives outside the JSON-LD, in its own <section>.
  const aboutHtml = firstGroup(html, /<section[^>]*jobs-company-block[^>]*>([\s\S]*?)<\/section>/i);
  const about = htmlToText(aboutHtml.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i, ""))
    .split("\n")
    .filter((l) => !/→\s*$/.test(l) && !/at this company/i.test(l)) // "View jobs at this company →" links
    .join("\n");
  if (about) sections.about = about;

  for (const k of Object.keys(sections) as (keyof Sections)[]) {
    const v = scrubBoilerplate(sections[k] ?? "");
    if (v) sections[k] = v;
    else delete sections[k];
  }

  const applyText = sections.howToApply ?? "";
  const deadlineDate = posting.validThrough?.slice(0, 10);
  const img = posting.image ?? posting.hiringOrganization?.logo;
  const logo = typeof img === "string" ? img : img?.url;

  return {
    description: (sections.jobDescription ?? text(desc)).slice(0, 4000),
    applyText,
    applyEmail: firstMatch(applyText, /[\w.+-]+@[\w-]+\.[\w.-]+/)?.replace(/\.$/, ""),
    applyPhone: cleanPhone(firstMatch(applyText, /(\+?\d[\d\s-]{7,}\d)/)),
    deadline: deadlineDate,
    deadlineDate,
    logo,
    sections,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// vacancymail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detail markup (vacancymail, verified 2026-09-03 / 2026-09-30):
 *   <div class="single-page-section">
 *     <h3>How to Apply</h3>
 *     <p>Interested candidates to send their CVs to EMAIL or PHONE before DATE</p>
 */
export function parseDetail(rawHtml: string): JobDetail {
  // Drop scripts FIRST: JSON-LD can contain a copy of "How to Apply</h3>", and a
  // regex that starts inside a <script> leaks raw JSON into the section.
  const html = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, " ");

  const applyText = scrubBoilerplate(
    htmlToText(firstGroup(html, /how to apply<\/h3>\s*([\s\S]*?)<\/div>/i)).replace(/\*\*/g, ""),
  );

  // Full JD: content up to the "Similar Jobs" section, from the content column.
  const end = html.search(/Similar Jobs/i);
  const body = end > -1 ? html.slice(0, end) : html;
  const contentStart = body.search(/content-right-offset|single-page-section/i);
  const description = scrubBoilerplate(text(contentStart > -1 ? body.slice(contentStart) : body)).slice(0, 4000);

  const applyEmail = firstMatch(applyText, /[\w.+-]+@[\w-]+\.[\w.-]+/)?.replace(/\.$/, "");
  const applyPhone = cleanPhone(firstMatch(applyText, /(\+?\d[\d\s-]{7,}\d)/));
  const deadline =
    firstMatch(applyText, /before\s+(.+?)(?:\.|$)/im, 1)?.trim() ||
    // "The closing date … is 6 October 2026." / "Due Date: 6 Oct 2026"
    firstMatch(
      applyText,
      /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4})/i,
      1,
    );

  const logoSrc =
    firstMatch(html, /class="[^"]*single-page-image[^"]*"[\s\S]*?<img[^>]*src="([^"]+)"/i, 1) ||
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
function extractSections(html: string): Sections {
  const end = html.search(/Similar Jobs/i);
  const body = end > -1 ? html.slice(0, end) : html;
  const map: [keyof Sections, string][] = [
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

  const sections: Sections = {};
  for (let i = 0; i < found.length; i++) {
    const startTag = body.indexOf("</h", found[i].idx);
    const start = body.indexOf(">", startTag) + 1;
    const hardStop = i + 1 < found.length ? found[i + 1].idx : body.length;
    let rest = body.slice(start, hardStop);
    // Trim inter-section junk (the next section block, apply widgets, forms)
    // so a section only contains its own content.
    const cuts = [/<div[^>]*class="[^"]*single-page-section/i, /apply for this job|share this job|report this|<form/i]
      .map((re) => rest.search(re))
      .filter((x) => x > -1);
    if (cuts.length) rest = rest.slice(0, Math.min(...cuts));
    const v = scrubBoilerplate(htmlToText(rest).replace(/\*\*/g, ""));
    if (v) sections[found[i].key] = v;
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
