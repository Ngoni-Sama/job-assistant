import type {
  Application,
  Env,
  JobListing,
  Prefs,
  Profile,
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
import { getConfig, saveConfig, chat, type AppConfig } from "./lib/ai/provider";
import { quickMatch, type QuickMatchRun } from "./lib/ai/quickmatch";
import { extractProfile } from "./lib/ai/profileextract";
import { charge, getCredits, addCredits, COSTS } from "./lib/credits";
import { PACKS, createCheckoutSession, verifyWebhook } from "./lib/stripe";

const JOBS_KEY = "jobs:all";
const STATS_KEY = "jobs:stats";
const SOURCES_KEY = "scrape:sources";
const DEFAULT_PREFS: Prefs = { autoApply: false, categories: [] };

/** Write / paid-action routes that require a signed-in user (not "demo"). */
const PROTECTED = new Set([
  "POST /api/upload-cv",
  "POST /api/prefs",
  "POST /api/profile",
  "POST /api/profile/from-cv",
  "POST /api/apply/prepare",
  "POST /api/apply/send",
  "POST /api/match",
  "POST /api/match-all",
  "POST /api/quick-match",
  "POST /api/billing/checkout",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return preflight();

    const url = new URL(request.url);
    const path = url.pathname;
    const userId = request.headers.get("x-user-id") ?? "demo";

    try {
      if (path === "/" || path === "/api/health") {
        // `version` is a deploy marker — bump it to confirm auto-deploy shipped.
        return json({ ok: true, service: "job-assistant", version: "2026-09-04.1" });
      }

      // TEMP diagnostic: probe which Workers AI models are live on this account.
      if (path === "/api/ai-test" && request.method === "GET") {
        const models = [
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          "@cf/meta/llama-3.1-8b-instruct-fast",
          "@cf/meta/llama-3.1-8b-instruct",
          "@cf/meta/llama-4-scout-17b-16e-instruct",
          "@cf/meta/llama-3-8b-instruct",
          "@cf/mistralai/mistral-small-3.1-24b-instruct",
          "@cf/qwen/qwen2.5-coder-32b-instruct",
        ];
        const out: Record<string, unknown> = {};
        for (const m of models) {
          try {
            const r = (await env.AI.run(m as never, {
              messages: [{ role: "user", content: "Reply with the single word OK" }],
              max_tokens: 5,
            })) as { response?: string };
            out[m] = { ok: true, response: (r.response ?? "").slice(0, 40) };
          } catch (e) {
            out[m] = { ok: false, error: (e as Error).message.slice(0, 120) };
          }
        }
        let chatTest: unknown;
        try {
          chatTest = { ok: true, response: await chat(env, [{ role: "user", content: "Reply with the single word OK" }], 5) };
        } catch (e) {
          chatTest = { ok: false, error: (e as Error).message.slice(0, 160) };
        }
        return json({ config: (await getConfig(env)).aiProvider, chat: chatTest, models: out });
      }

      // Data isolation: signed-out ("demo") callers may READ public data but must
      // not write per-user data or run paid AI actions — otherwise everyone
      // signed-out would share one "demo" space. Reads stay open (they return the
      // demo space, which stays empty because writes are blocked here).
      if (userId === "demo" && PROTECTED.has(`${request.method} ${path}`)) {
        return json({ error: "Please sign in to continue" }, { status: 401 });
      }

      // --- Billing / credits ---
      // Stripe webhook: fulfils credit purchases. Server-to-server (no x-user-id).
      if (path === "/api/billing/webhook" && request.method === "POST") {
        const sig = request.headers.get("stripe-signature") ?? "";
        const raw = await request.text();
        const event = await verifyWebhook(env, raw, sig);
        if (!event) return json({ error: "Invalid signature" }, { status: 400 });
        if (event.type === "checkout.session.completed") {
          const s = (event.data as { object: Record<string, unknown> }).object;
          const buyer = (s.client_reference_id as string) ||
            ((s.metadata as Record<string, string>)?.userId ?? "");
          const credits = Number((s.metadata as Record<string, string>)?.credits ?? 0);
          if (buyer && credits > 0) await addCredits(env, buyer, credits);
        }
        return json({ received: true });
      }

      if (path === "/api/credits" && request.method === "GET") {
        return json({ balance: await getCredits(env, userId), costs: COSTS });
      }
      if (path === "/api/billing/packs" && request.method === "GET") {
        return json({ packs: PACKS });
      }
      if (path === "/api/billing/checkout" && request.method === "POST") {
        if (userId === "demo") return json({ error: "Sign in to buy credits" }, { status: 401 });
        const { packId } = (await request.json()) as { packId?: string };
        try {
          const url = await createCheckoutSession(env, userId, packId ?? "");
          return json({ url });
        } catch (err) {
          return json({ error: (err as Error).message }, { status: 502 });
        }
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

        const paidMatch = await charge(env, userId, COSTS.matchAll);
        if (!paidMatch.ok) {
          return json(
            { error: "Not enough credits to match all jobs", balance: paidMatch.balance, cost: COSTS.matchAll },
            { status: 402 },
          );
        }
        const scores = [];
        for (const job of jobs.slice(0, 15)) {
          scores.push(await matchJobToCV(cv.markdown, job, env));
        }
        scores.sort((a, b) => b.score - a.score);
        return json({ scores });
      }

      // Who am I + am I an admin?
      if (path === "/api/me" && request.method === "GET") {
        return json({ userId, isAdmin: await isAdmin(env, userId) });
      }

      // --- Admin config (AI provider, API keys, feature flags) ---
      if (path === "/api/admin/config") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
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

      // --- Admin allowlist: invite / remove other admins ---
      if (path === "/api/admin/admins") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        if (request.method === "GET") {
          const invited = (await env.JOBS_CACHE.get<string[]>(ADMINS_KEY, "json")) ?? [];
          return json({ invited, bootstrap: bootstrapAdmins(env) });
        }
        if (request.method === "POST") {
          const { email } = (await request.json()) as { email?: string };
          const clean = email?.trim();
          if (!clean || !clean.includes("@")) {
            return json({ error: "A valid email is required" }, { status: 400 });
          }
          const invited = (await env.JOBS_CACHE.get<string[]>(ADMINS_KEY, "json")) ?? [];
          if (!invited.some((e) => e.toLowerCase() === clean.toLowerCase())) invited.push(clean);
          await env.JOBS_CACHE.put(ADMINS_KEY, JSON.stringify(invited));
          return json({ invited, bootstrap: bootstrapAdmins(env) });
        }
        if (request.method === "DELETE") {
          const { email } = (await request.json()) as { email?: string };
          const invited = ((await env.JOBS_CACHE.get<string[]>(ADMINS_KEY, "json")) ?? []).filter(
            (e) => e.toLowerCase() !== (email ?? "").trim().toLowerCase(),
          );
          await env.JOBS_CACHE.put(ADMINS_KEY, JSON.stringify(invited));
          return json({ invited, bootstrap: bootstrapAdmins(env) });
        }
      }

      // --- Quick Match AI: analyse all listings vs the user's CV, save to history ---
      if (path === "/api/quick-match" && request.method === "POST") {
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        if (!cv) return json({ error: "Upload a CV first to run Quick Match" }, { status: 400 });
        const jobs = await getJobs(env);
        if (jobs.length === 0) return json({ error: "No jobs cached yet" }, { status: 400 });

        const paid = await charge(env, userId, COSTS.quickMatch);
        if (!paid.ok) {
          return json(
            { error: "Not enough credits for Quick Match", balance: paid.balance, cost: COSTS.quickMatch },
            { status: 402 },
          );
        }
        const run = await quickMatch(cv.markdown, jobs, env);

        // Prepend to history, keep the most recent 10 runs.
        const history = await getQuickHistory(env, userId);
        history.unshift(run);
        await env.JOBS_CACHE.put(quickKey(userId), JSON.stringify(history.slice(0, 10)));
        return json({ run });
      }

      if (path === "/api/quick-match/history" && request.method === "GET") {
        return json({ history: await getQuickHistory(env, userId) });
      }

      // --- Candidate profile (availability + headline + sector) ---
      if (path === "/api/profile" && request.method === "GET") {
        return json({ profile: await getProfile(env, userId) });
      }
      if (path === "/api/profile" && request.method === "POST") {
        if (userId === "demo") return json({ error: "Sign in to update your profile" }, { status: 401 });
        const patch = (await request.json()) as Partial<Profile>;
        const current = await getProfile(env, userId);
        const next: Profile = {
          availability: patch.availability ?? current.availability,
          headline: (patch.headline ?? current.headline).slice(0, 120),
          sector: patch.sector ?? current.sector,
          updatedAt: new Date().toISOString(),
        };
        await env.JOBS_CACHE.put(profileKey(userId), JSON.stringify(next));
        return json({ profile: next });
      }
      // Auto-fill the profile from the user's uploaded CV via AI.
      if (path === "/api/profile/from-cv" && request.method === "POST") {
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        if (!cv) return json({ error: "Upload a CV first" }, { status: 400 });
        const paid = await charge(env, userId, COSTS.optimise);
        if (!paid.ok) {
          return json({ error: "Not enough credits", balance: paid.balance }, { status: 402 });
        }
        const extracted = await extractProfile(cv.markdown, env);
        const current = await getProfile(env, userId);
        const next: Profile = { ...current, ...extracted, updatedAt: new Date().toISOString() };
        await env.JOBS_CACHE.put(profileKey(userId), JSON.stringify(next));
        return json({ profile: next });
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

        const paidPrep = await charge(env, userId, COSTS.optimise);
        if (!paidPrep.ok) {
          return json(
            { error: "Not enough credits to optimise a CV", balance: paidPrep.balance, cost: COSTS.optimise },
            { status: 402 },
          );
        }
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

const ADMINS_KEY = "config:admins";

/** Emails hardcoded in ADMIN_EMAILS — permanent "bootstrap" admins. */
function bootstrapAdmins(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Admin = a bootstrap admin (env) OR an invited admin (editable KV list). */
async function isAdmin(env: Env, userId: string): Promise<boolean> {
  if (userId === "demo") return false;
  const email = userId.toLowerCase();
  if (bootstrapAdmins(env).some((e) => e.toLowerCase() === email)) return true;
  const invited = (await env.JOBS_CACHE.get<string[]>(ADMINS_KEY, "json")) ?? [];
  return invited.some((e) => e.toLowerCase() === email);
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
const profileKey = (userId: string) => `profile:${userId}`;

const DEFAULT_PROFILE: Profile = {
  availability: "not_looking",
  headline: "",
  sector: "",
  updatedAt: "",
};

async function getProfile(env: Env, userId: string): Promise<Profile> {
  return (await env.JOBS_CACHE.get<Profile>(profileKey(userId), "json")) ?? DEFAULT_PROFILE;
}
const appKey = (userId: string, jobId: string) => `application:${userId}:${jobId}`;
const appliedKey = (userId: string) => `applied:${userId}`;
const quickKey = (userId: string) => `quickmatch:${userId}`;

async function getQuickHistory(env: Env, userId: string): Promise<QuickMatchRun[]> {
  return (await env.JOBS_CACHE.get<QuickMatchRun[]>(quickKey(userId), "json")) ?? [];
}

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
