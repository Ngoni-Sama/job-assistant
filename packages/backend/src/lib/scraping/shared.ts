const UA =
  "Mozilla/5.0 (compatible; JobAssistant/0.1; +https://github.com/Ngoni-Sama/job-assistant)";

/** Fetch a URL and return its HTML, throwing on non-2xx. */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.text();
}

export function firstGroup(input: string, re: RegExp): string {
  const m = input.match(re);
  return m ? m[1] : "";
}

// Named HTML entities we care about (numeric ones are decoded generically).
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", hellip: "…", middot: "·",
  bull: "•", trade: "™", copy: "©", reg: "®", deg: "°",
};

function fromCodePoint(n: number): string {
  try {
    return n >= 32 || n === 9 || n === 10 ? String.fromCodePoint(n) : " ";
  } catch {
    return " ";
  }
}

/** Decode numeric (&#8217; / &#x2019;) and common named HTML entities. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Strip tags + collapse whitespace + fully decode HTML entities. */
export function text(raw: string): string {
  const stripped = raw
    // Remove script/style blocks (and the leftover ad-push calls) BEFORE tags,
    // otherwise the JS text (e.g. adsbygoogle...) ends up in the description.
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\(?\s*adsbygoogle[\s\S]*?\}\s*\)\s*;?/gi, " ")
    .replace(/window\.adsbygoogle[^;]*;?/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

// Site chrome that leaks into scraped bodies (jobszimbabwe / vacancymail nav, FAQ…).
const NAV_PHRASES = [
  "Login Register", "Job Alerts", "Tender Watch", "Post a Job", "View all jobs",
  "Apply for this job", "Share this job", "Report this job", "Save this job",
  "Related Jobs", "Similar Jobs", "About Us", "Sign in", "Sign up",
];

/**
 * Remove boilerplate that upstream markup leaks into a job section: JSON/JSON-LD
 * fragments, URL path slugs, nav chrome, trailing FAQ blocks, and duplicated
 * section labels. Applied to section bodies + descriptions after `text()`.
 */
export function scrubBoilerplate(s: string): string {
  let out = ` ${s} `;
  // Leaked JSON-LD / JSON fragments (e.g. "applicantLocationRequirements":{"@type":…}}).
  out = out.replace(/"@(context|type|id)"\s*:\s*"[^"]*"/gi, " ");
  out = out.replace(/"[a-zA-Z@]+"\s*:\s*\{[\s\S]{0,500}?\}\}*/g, " ");
  out = out.replace(/\{[^{}]*"@type"[^{}]*\}\}?/g, " ");
  // URL / path slug fragments (e.g. zw/jobs/it-assistant-clover-leaf-motors-2/).
  out = out.replace(/https?:\/\/\S+/gi, " ");
  out = out.replace(/\b[a-z]{2}\/jobs\/[a-z0-9-]+\/?/gi, " ");
  // Trailing FAQ block.
  out = out.replace(/\s(Frequently Asked Questions|FAQ'?s?)\b[\s\S]*$/i, " ");
  // Nav chrome phrases.
  for (const p of NAV_PHRASES) {
    out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  // Collapse duplicated consecutive labels ("Job Summary Job Summary" → one).
  out = out.replace(/\b([A-Z][A-Za-z ]{2,30}?)\s+\1\b/g, "$1");
  // Stray lone "zw" tokens left by slug stripping, and orphaned braces/brackets.
  out = out.replace(/\s+zw\s+/gi, " ");
  out = out.replace(/(^|\s)[{}[\]]+(?=\s|$)/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

/** Small stable hash for deterministic job ids (dedupes across runs). */
export function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}
