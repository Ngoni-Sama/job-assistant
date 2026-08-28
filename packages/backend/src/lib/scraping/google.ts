import type { JobListing } from "../../types";

/** Google Jobs search via Serper.dev. Returns [] when no API key is configured. */
export async function searchGoogleJobs(
  query: string,
  location: string,
  apiKey?: string,
): Promise<JobListing[]> {
  if (!apiKey) return [];

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: `${query} jobs in ${location}`,
      gl: "zw",
      hl: "en",
      num: 20,
    }),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as { organic?: Array<Record<string, string>> };

  return (data.organic ?? []).map((r, i) => ({
    id: `g-${i}-${(r.link ?? "").slice(-16)}`,
    title: r.title ?? "Untitled",
    company: r.source ?? "Unknown",
    location,
    postedDate: r.date ?? "",
    description: r.snippet ?? "",
    requirements: [],
    applyLink: r.link ?? "",
    source: "google/serper",
  }));
}
