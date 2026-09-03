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

/** Strip tags + collapse whitespace + decode a few common entities. */
export function text(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&#8217;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Small stable hash for deterministic job ids (dedupes across runs). */
export function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}
