import type { Env, JobListing, StoredCV } from "./types";
import { json, preflight } from "./lib/utils/cors";
import { scrapeVacancyMail } from "./lib/scraping/vacancymail";
import { searchGoogleJobs } from "./lib/scraping/google";
import { processCV } from "./lib/ai/extractor";
import { matchJobToCV } from "./lib/ai/matcher";

const JOBS_KEY = "jobs:all";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return preflight();

    const url = new URL(request.url);
    const path = url.pathname;
    const userId = request.headers.get("x-user-id") ?? "demo";

    try {
      // Health check
      if (path === "/" || path === "/api/health") {
        return json({ ok: true, service: "job-assistant" });
      }

      // Upload + process a CV (PDF → Markdown)
      if (path === "/api/upload-cv" && request.method === "POST") {
        const form = await request.formData();
        const file = form.get("cv");
        if (!file || typeof file === "string") {
          return json({ error: "Expected a 'cv' file field" }, { status: 400 });
        }
        const stored = await processCV(file, env, userId);
        return json({ success: true, cv: stored });
      }

      // Return the active CV markdown for a user
      if (path === "/api/cv" && request.method === "GET") {
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        return json({ cv });
      }

      // Trigger a scrape and cache results
      if (path === "/api/scrape" && request.method === "POST") {
        const jobs = await runScrape(env);
        return json({ success: true, count: jobs.length, jobs });
      }

      // List cached jobs
      if (path === "/api/jobs" && request.method === "GET") {
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
        return json({ jobs });
      }

      // Score one job (by id) against the user's CV
      if (path === "/api/match" && request.method === "POST") {
        const { jobId } = (await request.json()) as { jobId?: string };
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
        const job = jobs.find((j) => j.id === jobId);
        if (!cv) return json({ error: "No CV uploaded yet" }, { status: 400 });
        if (!job) return json({ error: "Job not found" }, { status: 404 });

        const score = await matchJobToCV(cv.markdown, job, env);
        return json({ score });
      }

      // Score ALL cached jobs against the user's CV
      if (path === "/api/match-all" && request.method === "POST") {
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        if (!cv) return json({ error: "No CV uploaded yet" }, { status: 400 });
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];

        const scores = [];
        for (const job of jobs.slice(0, 15)) {
          scores.push(await matchJobToCV(cv.markdown, job, env));
        }
        scores.sort((a, b) => b.score - a.score);
        return json({ scores });
      }

      return json({ error: "Not found" }, { status: 404 });
    } catch (err) {
      console.error(err);
      return json({ error: (err as Error).message }, { status: 500 });
    }
  },

  // Cron: refresh the job cache automatically.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await runScrape(env);
  },
} satisfies ExportedHandler<Env>;

/** Scrape all sources, dedupe by id, and cache the merged list. */
async function runScrape(env: Env): Promise<JobListing[]> {
  const collected: JobListing[] = [];

  try {
    collected.push(...(await scrapeVacancyMail(env.DEFAULT_SCRAPE_URL)));
  } catch (err) {
    console.error("vacancymail scrape failed", err);
  }

  try {
    collected.push(
      ...(await searchGoogleJobs("software developer", "Zimbabwe", env.SERPER_API_KEY)),
    );
  } catch (err) {
    console.error("google scrape failed", err);
  }

  const deduped = Array.from(new Map(collected.map((j) => [j.id, j])).values());
  await env.JOBS_CACHE.put(JOBS_KEY, JSON.stringify(deduped));
  return deduped;
}
