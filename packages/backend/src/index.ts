import type {
  Application,
  Env,
  JobListing,
  Prefs,
  ScrapeSource,
  ScrapeStats,
  StoredCV,
} from "./types";
import { json, preflight } from "./lib/utils/cors";
import { DEFAULT_SOURCES, isSupported, scrapeSource } from "./lib/scraping/registry";
import { searchGoogleJobs } from "./lib/scraping/google";
import { fetchJobDetail } from "./lib/scraping/detail";
import { isCurrent } from "./lib/utils/date";
import { categorize } from "./lib/categorize";
import { processCV } from "./lib/ai/extractor";
import { matchJobToCV } from "./lib/ai/matcher";
import { tailorApplication } from "./lib/ai/cvwriter";
import { sendApplication } from "./lib/email";
import { getConfig, saveConfig, type AppConfig } from "./lib/ai/provider";

const JOBS_KEY = "jobs:all";
const STATS_KEY = "jobs:stats";
const SOURCES_KEY = "scrape:sources";
const DEFAULT_PREFS: Prefs = { autoApply: false, categories: [] };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return preflight();

    const url = new URL(request.url);
    const path = url.pathname;
    const userId = request.headers.get("x-user-id") ?? "demo";

    try {
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

      if (path === "/api/cv" && request.method === "GET") {
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        return json({ cv });
      }

      // --- Scrape sources (user-configurable) ---
      if (path === "/api/sources" && request.method === "GET") {
        return json({ sources: await getSources(env) });
      }
      if (path === "/api/sources" && request.method === "POST") {
        const body = (await request.json()) as { url?: string; label?: string };
        if (!body.url || !isValidUrl(body.url)) {
          return json({ error: "A valid 'url' is required" }, { status: 400 });
        }
        const sources = await getSources(env);
        if (sources.some((s) => s.url === body.url)) {
          return json({ error: "Source already exists", sources }, { status: 409 });
        }
        sources.push({
          url: body.url,
          label: body.label?.trim() || hostLabel(body.url),
          enabled: true,
        });
        await env.JOBS_CACHE.put(SOURCES_KEY, JSON.stringify(sources));
        return json({ sources, supported: isSupported(body.url) });
      }
      if (path === "/api/sources" && request.method === "DELETE") {
        const body = (await request.json()) as { url?: string };
        const sources = (await getSources(env)).filter((s) => s.url !== body.url);
        await env.JOBS_CACHE.put(SOURCES_KEY, JSON.stringify(sources));
        return json({ sources });
      }

      // Trigger a scrape across all enabled sources
      if (path === "/api/scrape" && request.method === "POST") {
        const { jobs, stats } = await runScrape(env);
        return json({ success: true, count: jobs.length, stats, jobs });
      }

      // List cached jobs + stats
      if (path === "/api/jobs" && request.method === "GET") {
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
        const stats = await env.JOBS_CACHE.get<ScrapeStats>(STATS_KEY, "json");
        return json({ jobs, stats });
      }

      // Score one job against the user's CV
      if (path === "/api/match" && request.method === "POST") {
        const { jobId } = (await request.json()) as { jobId?: string };
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
        const job = jobs.find((j) => j.id === jobId);
        if (!cv) return json({ error: "No CV uploaded yet" }, { status: 400 });
        if (!job) return json({ error: "Job not found" }, { status: 404 });
        return json({ score: await matchJobToCV(cv.markdown, job, env) });
      }

      // Score all cached jobs against the user's CV
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

      // Who am I + am I an admin?
      if (path === "/api/me" && request.method === "GET") {
        return json({ userId, isAdmin: isAdmin(env, userId) });
      }

      // --- Admin config (AI provider, API keys, feature flags) ---
      if (path === "/api/admin/config") {
        if (!isAdmin(env, userId)) return json({ error: "Forbidden" }, { status: 403 });
        if (request.method === "GET") {
          return json({ config: maskConfig(await getConfig(env)) });
        }
        if (request.method === "POST") {
          const patch = (await request.json()) as Partial<AppConfig>;
          const current = await getConfig(env);
          const next: AppConfig = {
            ...current,
            ...patch,
            features: { ...current.features, ...(patch.features ?? {}) },
            // Keep the existing key when the client sends back the masked value.
            openaiApiKey:
              patch.openaiApiKey && !patch.openaiApiKey.includes("•")
                ? patch.openaiApiKey
                : current.openaiApiKey,
          };
          await saveConfig(env, next);
          return json({ config: maskConfig(next) });
        }
      }

      // --- Preferences (auto-apply + categories) ---
      if (path === "/api/prefs" && request.method === "GET") {
        return json({ prefs: await getPrefs(env, userId) });
      }
      if (path === "/api/prefs" && request.method === "POST") {
        const body = (await request.json()) as Partial<Prefs>;
        const prefs: Prefs = {
          autoApply: body.autoApply ?? (await getPrefs(env, userId)).autoApply,
          categories: body.categories ?? (await getPrefs(env, userId)).categories,
        };
        await env.JOBS_CACHE.put(prefsKey(userId), JSON.stringify(prefs));
        return json({ prefs });
      }

      // Which jobs the user has applied to
      if (path === "/api/applied" && request.method === "GET") {
        return json({ applied: await getApplied(env, userId) });
      }

      // Prepare an application: detect How-to-Apply + tailor CV.
      // Auto-sends when the user's autoApply preference is on and email is known.
      if (path === "/api/apply/prepare" && request.method === "POST") {
        const { jobId } = (await request.json()) as { jobId?: string };
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        if (!cv) return json({ error: "No CV uploaded yet" }, { status: 400 });
        const job = (await getJobs(env)).find((j) => j.id === jobId);
        if (!job) return json({ error: "Job not found" }, { status: 404 });

        const detail = await fetchJobDetail(job.applyLink);
        const tailored = await tailorApplication(cv.markdown, job, detail, env);

        const application: Application = {
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          to: detail.applyEmail,
          phone: detail.applyPhone,
          deadline: detail.deadline,
          applyText: detail.applyText,
          subject: `Application: ${job.title}${job.company !== "N/A" ? ` — ${job.company}` : ""}`,
          coverNote: tailored.coverNote,
          tailoredCV: tailored.tailoredCV,
          generatedAt: new Date().toISOString(),
        };
        await env.JOBS_CACHE.put(appKey(userId, job.id), JSON.stringify(application));

        const prefs = await getPrefs(env, userId);
        const { features } = await getConfig(env);
        let autoSent = null;
        if (prefs.autoApply && features.autoApplyAllowed && application.to) {
          autoSent = await doSend(env, userId, application);
        }
        return json({ application, autoSent });
      }

      // Send a previously prepared application (user-confirmed).
      if (path === "/api/apply/send" && request.method === "POST") {
        const { jobId } = (await request.json()) as { jobId?: string };
        const application = await env.JOBS_CACHE.get<Application>(
          appKey(userId, jobId ?? ""),
          "json",
        );
        if (!application) {
          return json({ error: "Prepare the application first" }, { status: 400 });
        }
        return json({ result: await doSend(env, userId, application) });
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

/** Load configured sources, seeding defaults on first run. */
async function getSources(env: Env): Promise<ScrapeSource[]> {
  const stored = await env.JOBS_CACHE.get<ScrapeSource[]>(SOURCES_KEY, "json");
  if (stored && stored.length) return stored;
  await env.JOBS_CACHE.put(SOURCES_KEY, JSON.stringify(DEFAULT_SOURCES));
  return DEFAULT_SOURCES;
}

/** Map a source URL to its admin feature flag; unknown hosts are always allowed. */
function featureEnabled(url: string, features: AppConfig["features"]): boolean {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (host === "vacancymail.co.zw") return features.vacancymail;
  if (host === "jobszimbabwe.co.zw") return features.jobszimbabwe;
  return true;
}

function isAdmin(env: Env, userId: string): boolean {
  if (userId === "demo") return false;
  const admins = (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase());
  return admins.includes(userId.toLowerCase());
}

/** Never return the raw OpenAI key to the client — mask all but the last 4. */
function maskConfig(config: AppConfig): AppConfig {
  const key = config.openaiApiKey;
  return {
    ...config,
    openaiApiKey: key ? `${"•".repeat(8)}${key.slice(-4)}` : undefined,
  };
}

const prefsKey = (userId: string) => `prefs:${userId}`;
const appKey = (userId: string, jobId: string) => `application:${userId}:${jobId}`;
const appliedKey = (userId: string) => `applied:${userId}`;

async function getJobs(env: Env): Promise<JobListing[]> {
  return (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
}

async function getPrefs(env: Env, userId: string): Promise<Prefs> {
  return (await env.JOBS_CACHE.get<Prefs>(prefsKey(userId), "json")) ?? DEFAULT_PREFS;
}

async function getApplied(env: Env, userId: string): Promise<string[]> {
  return (await env.JOBS_CACHE.get<string[]>(appliedKey(userId), "json")) ?? [];
}

/** Send an application, record the outcome, and mark the job applied. */
async function doSend(env: Env, userId: string, application: Application) {
  const result = await sendApplication(application, env);

  application.sent = result.sent;
  application.method = result.method;
  if (result.sent) application.sentAt = new Date().toISOString();
  await env.JOBS_CACHE.put(appKey(userId, application.jobId), JSON.stringify(application));

  // Record as applied once dispatched by email (manual mailto is recorded when
  // the user confirms send too, so the UI can reflect intent).
  const applied = await getApplied(env, userId);
  if (!applied.includes(application.jobId)) {
    applied.push(application.jobId);
    await env.JOBS_CACHE.put(appliedKey(userId), JSON.stringify(applied));
  }
  return result;
}

/**
 * Scrape every enabled source, keep only current (unexpired) jobs, dedupe by id,
 * sort by soonest expiry, then cache the list plus summary stats.
 */
async function runScrape(env: Env): Promise<{ jobs: JobListing[]; stats: ScrapeStats }> {
  const { features } = await getConfig(env);
  const sources = (await getSources(env))
    .filter((s) => s.enabled)
    .filter((s) => featureEnabled(s.url, features));
  const collected: JobListing[] = [];

  for (const source of sources) {
    try {
      collected.push(...(await scrapeSource(source.url)));
    } catch (err) {
      console.error(`scrape failed for ${source.url}`, err);
    }
  }

  // Optional Google Jobs augmentation when enabled and a Serper key is configured.
  if (features.googleJobs && env.SERPER_API_KEY) {
    try {
      collected.push(
        ...(await searchGoogleJobs("software developer", "Zimbabwe", env.SERPER_API_KEY)),
      );
    } catch (err) {
      console.error("google scrape failed", err);
    }
  }

  // Merge fresh results into the existing cache rather than replacing it, so a
  // partial/empty scrape (a source failing) never wipes the list. Newly scraped
  // entries win on id collisions; only expired jobs are pruned.
  const existing = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
  const merged = Array.from(
    new Map([...existing, ...collected].map((j) => [j.id, j])).values(),
  )
    .filter((j) => isCurrent(j.expiryDate))
    .sort(byExpiry);

  // Classify sector for every job (re-runs on existing entries too, so older
  // cached jobs pick up sectors on the next scrape).
  for (const job of merged) job.sector = categorize(job.title, job.description);

  const stats = buildStats(merged);
  await env.JOBS_CACHE.put(JOBS_KEY, JSON.stringify(merged));
  await env.JOBS_CACHE.put(STATS_KEY, JSON.stringify(stats));
  return { jobs: merged, stats };
}

/** Soonest-expiring first; undated jobs last. */
function byExpiry(a: JobListing, b: JobListing): number {
  if (!a.expiryDate) return 1;
  if (!b.expiryDate) return -1;
  return a.expiryDate.localeCompare(b.expiryDate);
}

function buildStats(jobs: JobListing[]): ScrapeStats {
  const byLocation: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const j of jobs) {
    byLocation[j.location] = (byLocation[j.location] ?? 0) + 1;
    bySource[j.source] = (bySource[j.source] ?? 0) + 1;
  }
  return { total: jobs.length, byLocation, bySource, scrapedAt: new Date().toISOString() };
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
