import type {
  Announcement,
  Application,
  CandidateCard,
  CandidateCheck,
  Employer,
  Env,
  JobListing,
  Message,
  Prefs,
  Profile,
  Thread,
  ThreadSummary,
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
import { quickMatch, type QuickMatchRun } from "./lib/ai/quickmatch";
import { extractProfile } from "./lib/ai/profileextract";
import { charge, getCredits, addCredits, COSTS } from "./lib/credits";
import { PACKS, createCheckoutSession, verifyWebhook } from "./lib/stripe";
import { CHECKS, findCheck } from "./lib/checks";

const JOBS_KEY = "jobs:all";
const EXPIRED_KEY = "jobs:expired";
const STATS_KEY = "jobs:stats";
const MAX_ARCHIVE = 400; // cap the expired-jobs archive to bound storage
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
  "POST /api/employer",
  "POST /api/checks/order",
  "POST /api/cvs/primary",
  "POST /api/cvs/rename",
  "POST /api/cvs/update",
  "DELETE /api/cvs",
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

      // The user's original uploaded CV file (base64) — for sending as-is.
      // Optional ?id= selects a specific CV; otherwise the primary.
      if (path === "/api/cv-file" && request.method === "GET") {
        if (userId === "demo") return json({ error: "Sign in" }, { status: 401 });
        const id = url.searchParams.get("id");
        const file = await env.JOBS_CACHE.get(id ? `cvfile:${userId}:${id}` : `cvfile:${userId}`, "json");
        if (!file) return json({ error: "No original CV on file" }, { status: 404 });
        return json(file);
      }

      // --- Multiple CVs ---
      if (path === "/api/cvs" && request.method === "GET") {
        if (userId === "demo") return json({ cvs: [], primaryId: null });
        const cvs = await getCvList(env, userId);
        const primary = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        return json({ cvs, primaryId: primary?.id ?? cvs[cvs.length - 1]?.id ?? null });
      }
      if (path === "/api/cvs/primary" && request.method === "POST") {
        const { id } = (await request.json()) as { id?: string };
        const cvs = await getCvList(env, userId);
        const cv = cvs.find((c) => c.id === id);
        if (!cv) return json({ error: "CV not found" }, { status: 404 });
        await env.JOBS_CACHE.put(`cv:${userId}`, JSON.stringify(cv));
        const f = await env.JOBS_CACHE.get(`cvfile:${userId}:${cv.id}`);
        if (f) await env.JOBS_CACHE.put(`cvfile:${userId}`, f);
        return json({ cvs, primaryId: cv.id });
      }
      if (path === "/api/cvs/rename" && request.method === "POST") {
        const { id, fileName } = (await request.json()) as { id?: string; fileName?: string };
        const cvs = await getCvList(env, userId);
        const cv = cvs.find((c) => c.id === id);
        if (!cv || !fileName?.trim()) return json({ error: "Invalid" }, { status: 400 });
        cv.fileName = fileName.trim().slice(0, 80);
        await env.JOBS_CACHE.put(`cvs:${userId}`, JSON.stringify(cvs));
        await syncPrimary(env, userId, cv);
        return json({ cvs });
      }
      if (path === "/api/cvs/update" && request.method === "POST") {
        const { id, markdown } = (await request.json()) as { id?: string; markdown?: string };
        const cvs = await getCvList(env, userId);
        const cv = cvs.find((c) => c.id === id);
        if (!cv || typeof markdown !== "string") return json({ error: "Invalid" }, { status: 400 });
        cv.markdown = markdown;
        await env.JOBS_CACHE.put(`cvs:${userId}`, JSON.stringify(cvs));
        await syncPrimary(env, userId, cv);
        return json({ cvs });
      }
      if (path === "/api/cvs" && request.method === "DELETE") {
        const { id } = (await request.json()) as { id?: string };
        let cvs = await getCvList(env, userId);
        cvs = cvs.filter((c) => c.id !== id);
        await env.JOBS_CACHE.put(`cvs:${userId}`, JSON.stringify(cvs));
        await env.JOBS_CACHE.delete(`cvfile:${userId}:${id}`);
        // Re-point primary if we deleted it.
        const primary = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        if (!primary || primary.id === id) {
          const next = cvs[cvs.length - 1];
          if (next) {
            await env.JOBS_CACHE.put(`cv:${userId}`, JSON.stringify(next));
            const f = await env.JOBS_CACHE.get(`cvfile:${userId}:${next.id}`);
            if (f) await env.JOBS_CACHE.put(`cvfile:${userId}`, f);
          } else {
            await env.JOBS_CACHE.delete(`cv:${userId}`);
            await env.JOBS_CACHE.delete(`cvfile:${userId}`);
          }
        }
        return json({ cvs });
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

      // List cached (current) jobs + stats
      if (path === "/api/jobs" && request.method === "GET") {
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
        const stats = await env.JOBS_CACHE.get<ScrapeStats>(STATS_KEY, "json");
        return json({ jobs, stats });
      }

      // The Archive — closed / past openings (kept, not deleted).
      if (path === "/api/jobs/expired" && request.method === "GET") {
        const jobs = (await env.JOBS_CACHE.get<JobListing[]>(EXPIRED_KEY, "json")) ?? [];
        return json({ jobs });
      }

      // Single job + full detail (sections, apply info). Detail is cached after
      // the first fetch so repeat visits never re-scrape.
      if (path.startsWith("/api/job/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/job/".length));
        const current = await getJobs(env);
        const expiredPool = (await env.JOBS_CACHE.get<JobListing[]>(EXPIRED_KEY, "json")) ?? [];
        const jobs = [...current, ...expiredPool];
        const job = jobs.find((j) => j.id === id);
        if (!job) return json({ error: "Job not found" }, { status: 404 });

        const detailKey = `jobdetail:${id}`;
        let detail = await env.JOBS_CACHE.get<Awaited<ReturnType<typeof fetchJobDetail>>>(detailKey, "json");
        if (!detail) {
          try {
            detail = await fetchJobDetail(job.applyLink);
            await env.JOBS_CACHE.put(detailKey, JSON.stringify(detail), { expirationTtl: 60 * 60 * 24 * 7 });
            // Lazily enrich the CURRENT cached job so cards show email/logo
            // (archived jobs are closed — no write-back).
            if (detail.applyEmail || detail.logo) {
              const idx = current.findIndex((j) => j.id === id);
              if (idx > -1) {
                current[idx] = {
                  ...current[idx],
                  applyEmail: detail.applyEmail ?? current[idx].applyEmail,
                  logo: current[idx].logo ?? detail.logo,
                };
                await env.JOBS_CACHE.put(JOBS_KEY, JSON.stringify(current));
              }
            }
          } catch (err) {
            console.error("job detail fetch failed", err);
            detail = { description: job.description, applyText: "" };
          }
        }
        const enriched =
          detail.applyEmail || detail.logo
            ? { ...job, applyEmail: job.applyEmail ?? detail.applyEmail, logo: job.logo ?? detail.logo }
            : job;
        const similar = jobs.filter((j) => j.id !== id && j.sector === job.sector).slice(0, 6);
        return json({ job: enriched, detail, similar });
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
        // Score in parallel (was sequential — 15 AI calls blew the Worker time
        // limit and surfaced as "failed to fetch"). Cap to keep it fast.
        const scores = await Promise.all(
          jobs.slice(0, 10).map((job) => matchJobToCV(cv.markdown, job, env)),
        );
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

      // --- Verification / background checks ---
      if (path === "/api/checks" && request.method === "GET") {
        return json({ catalog: CHECKS, mine: await getChecks(env, userId) });
      }
      if (path === "/api/checks/order" && request.method === "POST") {
        const { checkId } = (await request.json()) as { checkId?: string };
        const check = findCheck(checkId ?? "");
        if (!check) return json({ error: "Unknown check" }, { status: 400 });
        const mine = await getChecks(env, userId);
        if (mine.some((c) => c.checkId === check.id && c.status !== "failed")) {
          return json({ error: "Already ordered", mine }, { status: 409 });
        }
        const paid = await charge(env, userId, check.credits);
        if (!paid.ok) {
          return json({ error: "Not enough credits", balance: paid.balance, cost: check.credits }, { status: 402 });
        }
        const next = mine.filter((c) => c.checkId !== check.id);
        next.push({ checkId: check.id, status: "pending", orderedAt: new Date().toISOString() });
        await env.JOBS_CACHE.put(checksKey(userId), JSON.stringify(next));
        return json({ mine: next, balance: paid.balance });
      }

      // Admin: review pending checks across all candidates.
      if (path === "/api/admin/checks" && request.method === "GET") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const { keys } = await env.JOBS_CACHE.list({ prefix: "checks:" });
        const items: { userId: string; check: CandidateCheck; name: string }[] = [];
        for (const k of keys) {
          const email = k.name.slice("checks:".length);
          const list = (await env.JOBS_CACHE.get<CandidateCheck[]>(k.name, "json")) ?? [];
          for (const c of list) {
            items.push({ userId: email, check: c, name: findCheck(c.checkId)?.name ?? c.checkId });
          }
        }
        return json({ items });
      }
      if (path === "/api/admin/checks" && request.method === "POST") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const { userId: target, checkId, status } = (await request.json()) as {
          userId?: string;
          checkId?: string;
          status?: CandidateCheck["status"];
        };
        if (!target || !checkId || !status) return json({ error: "Missing fields" }, { status: 400 });
        const list = (await env.JOBS_CACHE.get<CandidateCheck[]>(checksKey(target), "json")) ?? [];
        const c = list.find((x) => x.checkId === checkId);
        if (c) {
          c.status = status;
          if (status === "cleared") c.clearedAt = new Date().toISOString();
          await env.JOBS_CACHE.put(checksKey(target), JSON.stringify(list));
        }
        return json({ ok: true });
      }

      // --- Announcements / update notifications ---
      if (path === "/api/announcements" && request.method === "GET") {
        const announcements = await getAnnouncements(env);
        const seen = userId === "demo" ? "" : (await env.JOBS_CACHE.get(seenKey(userId))) ?? "";
        const unread = announcements.filter((a) => a.at > seen).length;
        return json({ announcements, unread });
      }
      if (path === "/api/announcements/seen" && request.method === "POST") {
        if (userId !== "demo") await env.JOBS_CACHE.put(seenKey(userId), new Date().toISOString());
        return json({ ok: true });
      }
      if (path === "/api/admin/announcements" && request.method === "POST") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const { title, body } = (await request.json()) as { title?: string; body?: string };
        if (!title?.trim() || !body?.trim()) return json({ error: "Title and body required" }, { status: 400 });
        const list = await getAnnouncements(env);
        list.unshift({ id: `a-${Date.now()}`, title: title.trim(), body: body.trim(), at: new Date().toISOString() });
        await env.JOBS_CACHE.put(ANNOUNCE_KEY, JSON.stringify(list.slice(0, 30)));
        return json({ announcements: list });
      }

      // --- Employer accounts ---
      if (path === "/api/employer" && request.method === "GET") {
        return json({ employer: await getEmployer(env, userId) });
      }
      if (path === "/api/employer" && request.method === "POST") {
        const form = await request.formData();
        const company = String(form.get("company") ?? "").trim();
        const contactPerson = String(form.get("contactPerson") ?? "").trim();
        if (!company || !contactPerson) {
          return json({ error: "Company and contact person are required" }, { status: 400 });
        }
        const existing = await getEmployer(env, userId);
        const docEntry = form.get("document");
        let documentName = existing?.documentName;
        if (docEntry && typeof docEntry !== "string") {
          const doc = docEntry as File;
          const buf = await doc.arrayBuffer();
          await env.JOBS_CACHE.put(
            `employerdoc:${userId}`,
            JSON.stringify({ name: doc.name, type: doc.type, data: bufferToBase64(buf) }),
          );
          documentName = doc.name;
        }
        const employer: Employer = {
          userId,
          company: company.slice(0, 100),
          contactPerson: contactPerson.slice(0, 100),
          // Re-submitting resets an approved account to pending re-vetting.
          status: "pending",
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          documentName,
        };
        await env.JOBS_CACHE.put(employerKey(userId), JSON.stringify(employer));
        return json({ employer });
      }

      // Admin: fetch an employer's uploaded vetting document (base64).
      if (path === "/api/admin/employer-doc" && request.method === "GET") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const target = url.searchParams.get("userId") ?? "";
        const doc = await env.JOBS_CACHE.get(`employerdoc:${target}`, "json");
        if (!doc) return json({ error: "No document" }, { status: 404 });
        return json(doc);
      }

      // A user's own applications (what the assistant has prepared/sent).
      if (path === "/api/applications" && request.method === "GET") {
        if (userId === "demo") return json({ applications: [] });
        const { keys } = await env.JOBS_CACHE.list({ prefix: `application:${userId}:` });
        const applications: Application[] = [];
        for (const k of keys) {
          const a = await env.JOBS_CACHE.get<Application>(k.name, "json");
          if (a) applications.push(a);
        }
        applications.sort((a, b) => (b.generatedAt || "").localeCompare(a.generatedAt || ""));
        return json({ applications });
      }

      // Candidate browse — approved employers only. Returns privacy-safe cards
      // (no contact details) grouped by sector.
      if (path === "/api/candidates" && request.method === "GET") {
        const employer = await getEmployer(env, userId);
        if (employer?.status !== "approved") {
          return json({ error: "Approved employer account required" }, { status: 403 });
        }
        return json({ sectors: await listCandidatesBySector(env) });
      }

      // Employer shortlist (swipe-right). Approved employers only.
      if (path === "/api/employer/shortlist") {
        const employer = await getEmployer(env, userId);
        if (employer?.status !== "approved") {
          return json({ error: "Approved employer account required" }, { status: 403 });
        }
        const skey = `shortlist:${userId}`;
        if (request.method === "GET") {
          const shortlist = (await env.JOBS_CACHE.get<CandidateCard[]>(skey, "json")) ?? [];
          const unlocked = (await env.JOBS_CACHE.get<Record<string, string>>(`unlocked:${userId}`, "json")) ?? {};
          return json({ shortlist, unlocked });
        }
        if (request.method === "POST") {
          const { candidate } = (await request.json()) as { candidate?: CandidateCard };
          if (!candidate?.id) return json({ error: "candidate required" }, { status: 400 });
          const list = (await env.JOBS_CACHE.get<CandidateCard[]>(skey, "json")) ?? [];
          if (!list.some((c) => c.id === candidate.id)) list.push(candidate);
          await env.JOBS_CACHE.put(skey, JSON.stringify(list));
          return json({ shortlist: list });
        }
        if (request.method === "DELETE") {
          const { id } = (await request.json()) as { id?: string };
          const list = ((await env.JOBS_CACHE.get<CandidateCard[]>(skey, "json")) ?? []).filter(
            (c) => c.id !== id,
          );
          await env.JOBS_CACHE.put(skey, JSON.stringify(list));
          return json({ shortlist: list });
        }
      }

      // --- Messaging (employer ↔ candidate) ---
      // Employer starts/continues a thread with a candidate (by hashed id).
      if (path === "/api/messages" && request.method === "POST") {
        const employer = await getEmployer(env, userId);
        if (employer?.status !== "approved") {
          return json({ error: "Approved employer account required" }, { status: 403 });
        }
        const { candidateId: cid, text } = (await request.json()) as {
          candidateId?: string;
          text?: string;
        };
        if (!cid || !text?.trim()) return json({ error: "candidateId and text required" }, { status: 400 });
        const email = await env.JOBS_CACHE.get(`cidmap:${cid}`);
        if (!email) return json({ error: "Candidate not found" }, { status: 404 });
        const cProfile = await getProfile(env, email);
        const thread = await appendMessage(env, {
          employerUserId: userId,
          employerCompany: employer.company,
          candidateEmail: email,
          candidateName: cProfile.name || "Candidate",
          from: "employer",
          text: text.trim(),
        });
        return json({ thread });
      }

      // Reply in a thread (either participant).
      if (path === "/api/messages/reply" && request.method === "POST") {
        if (userId === "demo") return json({ error: "Please sign in" }, { status: 401 });
        const { threadId, text } = (await request.json()) as { threadId?: string; text?: string };
        if (!threadId || !text?.trim()) return json({ error: "threadId and text required" }, { status: 400 });
        const thread = await env.JOBS_CACHE.get<Thread>(`thread:${threadId}`, "json");
        if (!thread) return json({ error: "Thread not found" }, { status: 404 });
        const role = participantRole(thread, userId);
        if (!role) return json({ error: "Not a participant" }, { status: 403 });
        const updated = await appendMessage(env, {
          employerUserId: thread.employerUserId,
          employerCompany: thread.employerCompany,
          candidateEmail: thread.candidateEmail,
          candidateName: thread.candidateName,
          from: role,
          text: text.trim(),
        });
        return json({ thread: updated });
      }

      // List my threads (works for both roles).
      if (path === "/api/threads" && request.method === "GET") {
        if (userId === "demo") return json({ threads: [] });
        return json({ threads: await listThreads(env, userId) });
      }

      // Full thread — participants only.
      if (path.startsWith("/api/thread/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/thread/".length));
        const thread = await env.JOBS_CACHE.get<Thread>(`thread:${id}`, "json");
        if (!thread) return json({ error: "Thread not found" }, { status: 404 });
        if (!participantRole(thread, userId)) return json({ error: "Not a participant" }, { status: 403 });
        return json({ thread });
      }

      // Unlock a candidate's contact — costs credits. Approved employers only.
      if (path === "/api/employer/unlock" && request.method === "POST") {
        const employer = await getEmployer(env, userId);
        if (employer?.status !== "approved") {
          return json({ error: "Approved employer account required" }, { status: 403 });
        }
        const { candidateId: cid } = (await request.json()) as { candidateId?: string };
        if (!cid) return json({ error: "candidateId required" }, { status: 400 });

        const ukey = `unlocked:${userId}`;
        const unlocked = (await env.JOBS_CACHE.get<Record<string, string>>(ukey, "json")) ?? {};
        // Already unlocked — return without charging again.
        if (unlocked[cid]) return json({ email: unlocked[cid], balance: await getCredits(env, userId) });

        const email = await env.JOBS_CACHE.get(`cidmap:${cid}`);
        if (!email) return json({ error: "Candidate not found" }, { status: 404 });

        const paid = await charge(env, userId, COSTS.unlockContact);
        if (!paid.ok) {
          return json({ error: "Not enough credits", balance: paid.balance, cost: COSTS.unlockContact }, { status: 402 });
        }
        unlocked[cid] = email;
        await env.JOBS_CACHE.put(ukey, JSON.stringify(unlocked));
        return json({ email, balance: paid.balance });
      }

      // Admin: list + approve/reject employer applications.
      if (path === "/api/admin/employers") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        if (request.method === "GET") {
          return json({ employers: await listEmployers(env) });
        }
        if (request.method === "POST") {
          const { userId: target, status, reason } = (await request.json()) as {
            userId?: string;
            status?: Employer["status"];
            reason?: string;
          };
          const emp = target ? await getEmployer(env, target) : null;
          if (!emp || !status) return json({ error: "Unknown employer" }, { status: 400 });
          emp.status = status;
          emp.rejectReason = status === "rejected" ? reason?.trim() || "Not approved." : undefined;
          await env.JOBS_CACHE.put(employerKey(emp.userId), JSON.stringify(emp));
          return json({ employers: await listEmployers(env) });
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
        const { jobId, cvId } = (await request.json()) as { jobId?: string; cvId?: string };
        const cv = await resolveCv(env, userId, cvId);
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

      // Retract an application from tracking (the email itself can't be recalled).
      if (path === "/api/apply/unsend" && request.method === "POST") {
        if (userId === "demo") return json({ error: "Please sign in" }, { status: 401 });
        const { jobId } = (await request.json()) as { jobId?: string };
        const app = await env.JOBS_CACHE.get<Application>(appKey(userId, jobId ?? ""), "json");
        if (app) {
          app.sent = false;
          app.sentAt = undefined;
          app.method = undefined;
          await env.JOBS_CACHE.put(appKey(userId, app.jobId), JSON.stringify(app));
        }
        const applied = (await getApplied(env, userId)).filter((id) => id !== jobId);
        await env.JOBS_CACHE.put(appliedKey(userId), JSON.stringify(applied));
        return json({ ok: true });
      }

      // Mark whether the employer has replied (manual).
      if (path === "/api/apply/responded" && request.method === "POST") {
        if (userId === "demo") return json({ error: "Please sign in" }, { status: 401 });
        const { jobId, responded } = (await request.json()) as { jobId?: string; responded?: boolean };
        const app = await env.JOBS_CACHE.get<Application>(appKey(userId, jobId ?? ""), "json");
        if (app) {
          app.responded = !!responded;
          await env.JOBS_CACHE.put(appKey(userId, app.jobId), JSON.stringify(app));
        }
        return json({ ok: true });
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

const checksKey = (userId: string) => `checks:${userId}`;
const seenKey = (userId: string) => `seen:${userId}`;
const ANNOUNCE_KEY = "announcements";

async function getChecks(env: Env, userId: string): Promise<CandidateCheck[]> {
  if (userId === "demo") return [];
  return (await env.JOBS_CACHE.get<CandidateCheck[]>(checksKey(userId), "json")) ?? [];
}

/** Cleared check categories for a candidate (drives the "verified" badges). */
async function clearedCategories(env: Env, email: string): Promise<string[]> {
  const mine = (await env.JOBS_CACHE.get<CandidateCheck[]>(checksKey(email), "json")) ?? [];
  const cats = new Set<string>();
  for (const c of mine) {
    if (c.status === "cleared") {
      const cat = findCheck(c.checkId)?.category;
      if (cat) cats.add(cat);
    }
  }
  return [...cats];
}

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "a-launch",
    title: "New: verification, in-app job details & more",
    body: "You can now get verified (Identity/Education/Background checks), view full job details in-app, browse jobs near you, and send tailored CVs as PDF or Word. Employers can browse, shortlist and message candidates.",
    at: "2026-09-06T00:00:00.000Z",
  },
];

async function getAnnouncements(env: Env): Promise<Announcement[]> {
  const stored = await env.JOBS_CACHE.get<Announcement[]>(ANNOUNCE_KEY, "json");
  if (stored && stored.length) return stored;
  await env.JOBS_CACHE.put(ANNOUNCE_KEY, JSON.stringify(DEFAULT_ANNOUNCEMENTS));
  return DEFAULT_ANNOUNCEMENTS;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const employerKey = (userId: string) => `employer:${userId}`;

async function getEmployer(env: Env, userId: string): Promise<Employer | null> {
  return env.JOBS_CACHE.get<Employer>(employerKey(userId), "json");
}

/** Deterministic thread id for an employer↔candidate pair. */
function threadId(employerUserId: string, candidateEmail: string): string {
  let h = 5381;
  const s = `${employerUserId.toLowerCase()}|${candidateEmail.toLowerCase()}`;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return `t${(h >>> 0).toString(36)}`;
}

function participantRole(t: Thread, userId: string): Message["from"] | null {
  const u = userId.toLowerCase();
  if (t.employerUserId.toLowerCase() === u) return "employer";
  if (t.candidateEmail.toLowerCase() === u) return "candidate";
  return null;
}

/** Append a message, creating the thread + updating both participants' indexes. */
async function appendMessage(
  env: Env,
  m: {
    employerUserId: string;
    employerCompany: string;
    candidateEmail: string;
    candidateName: string;
    from: Message["from"];
    text: string;
  },
): Promise<Thread> {
  const id = threadId(m.employerUserId, m.candidateEmail);
  const existing = await env.JOBS_CACHE.get<Thread>(`thread:${id}`, "json");
  const thread: Thread = existing ?? {
    id,
    employerUserId: m.employerUserId,
    employerCompany: m.employerCompany,
    candidateEmail: m.candidateEmail,
    candidateName: m.candidateName,
    messages: [],
    updatedAt: "",
  };
  thread.messages.push({ from: m.from, text: m.text, at: new Date().toISOString() });
  thread.updatedAt = new Date().toISOString();
  await env.JOBS_CACHE.put(`thread:${id}`, JSON.stringify(thread));
  await addToIndex(env, `empthreads:${m.employerUserId}`, id);
  await addToIndex(env, `candthreads:${m.candidateEmail}`, id);
  return thread;
}

async function addToIndex(env: Env, key: string, id: string): Promise<void> {
  const list = (await env.JOBS_CACHE.get<string[]>(key, "json")) ?? [];
  if (!list.includes(id)) {
    list.push(id);
    await env.JOBS_CACHE.put(key, JSON.stringify(list));
  }
}

async function listThreads(env: Env, userId: string): Promise<ThreadSummary[]> {
  const empIds = (await env.JOBS_CACHE.get<string[]>(`empthreads:${userId}`, "json")) ?? [];
  const candIds = (await env.JOBS_CACHE.get<string[]>(`candthreads:${userId}`, "json")) ?? [];
  const ids = [...new Set([...empIds, ...candIds])];
  const out: ThreadSummary[] = [];
  for (const id of ids) {
    const t = await env.JOBS_CACHE.get<Thread>(`thread:${id}`, "json");
    if (!t) continue;
    const role = participantRole(t, userId);
    const last = t.messages[t.messages.length - 1];
    out.push({
      id: t.id,
      withName: role === "employer" ? t.candidateName : t.employerCompany,
      lastMessage: last?.text ?? "",
      updatedAt: t.updatedAt,
      unreadFrom: last && last.from !== role ? last.from : null,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function listEmployers(env: Env): Promise<Employer[]> {
  const { keys } = await env.JOBS_CACHE.list({ prefix: "employer:" });
  const employers: Employer[] = [];
  for (const k of keys) {
    const e = await env.JOBS_CACHE.get<Employer>(k.name, "json");
    if (e) employers.push(e);
  }
  return employers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Stable non-reversible id so employers can reference a candidate without their email. */
function candidateId(email: string): string {
  let h = 5381;
  for (let i = 0; i < email.length; i++) h = (h * 33) ^ email.charCodeAt(i);
  return `c${(h >>> 0).toString(36)}`;
}

/** Discoverable candidates (looking/open) grouped by sector — no contact details. */
async function listCandidatesBySector(env: Env): Promise<Record<string, CandidateCard[]>> {
  const { keys } = await env.JOBS_CACHE.list({ prefix: "profile:" });
  const grouped: Record<string, CandidateCard[]> = {};
  for (const k of keys) {
    const email = k.name.slice("profile:".length);
    const p = await env.JOBS_CACHE.get<Profile>(k.name, "json");
    if (!p || p.availability === "not_looking") continue;
    const sector = p.sector || "Other";
    const cid = candidateId(email);
    // Map the hashed id back to the email so unlock can resolve it later.
    await env.JOBS_CACHE.put(`cidmap:${cid}`, email);
    (grouped[sector] ??= []).push({
      id: cid,
      name: p.name || "Candidate",
      headline: p.headline,
      sector,
      availability: p.availability,
      location: p.location,
      yearsExperience: p.yearsExperience,
      skills: p.skills,
      education: p.education,
      languages: p.languages,
      verifiedCategories: await clearedCategories(env, email),
    });
  }
  return grouped;
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

async function getCvList(env: Env, userId: string): Promise<StoredCV[]> {
  const list = await env.JOBS_CACHE.get<StoredCV[]>(`cvs:${userId}`, "json");
  if (list && list.length) return list;
  // Migrate a legacy single CV into the list.
  const legacy = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
  if (legacy) {
    const migrated = { ...legacy, id: legacy.id ?? `cv-legacy-${Date.now()}` };
    await env.JOBS_CACHE.put(`cvs:${userId}`, JSON.stringify([migrated]));
    return [migrated];
  }
  return [];
}

/** Keep cv:<userId> (the primary) in sync when the primary CV is edited/renamed. */
async function syncPrimary(env: Env, userId: string, cv: StoredCV): Promise<void> {
  const primary = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
  if (primary?.id === cv.id) await env.JOBS_CACHE.put(`cv:${userId}`, JSON.stringify(cv));
}

/** Resolve the CV to use for an action — a specific id, or the primary. */
async function resolveCv(env: Env, userId: string, cvId?: string): Promise<StoredCV | null> {
  if (cvId) {
    const cv = (await getCvList(env, userId)).find((c) => c.id === cvId);
    if (cv) return cv;
  }
  return env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
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

  // Merge fresh results with BOTH existing pools (current + archived expired),
  // dedupe (same-id and cross-source), then re-partition. Expired jobs are kept
  // in an archive rather than deleted.
  const existingCurrent = (await env.JOBS_CACHE.get<JobListing[]>(JOBS_KEY, "json")) ?? [];
  const existingExpired = (await env.JOBS_CACHE.get<JobListing[]>(EXPIRED_KEY, "json")) ?? [];
  const deduped = dedupeJobs([...existingCurrent, ...existingExpired, ...collected]);

  // Classify sector for every job (re-runs on older entries too).
  for (const job of deduped) job.sector = categorize(job.title, job.description);

  const current = deduped.filter((j) => isCurrent(j.expiryDate)).sort(byExpiry);
  const expired = deduped
    .filter((j) => !isCurrent(j.expiryDate))
    .sort((a, b) => (b.expiryDate ?? "").localeCompare(a.expiryDate ?? "")) // most-recently closed first
    .slice(0, MAX_ARCHIVE);

  const stats = buildStats(current);
  await env.JOBS_CACHE.put(JOBS_KEY, JSON.stringify(current));
  await env.JOBS_CACHE.put(EXPIRED_KEY, JSON.stringify(expired));
  await env.JOBS_CACHE.put(STATS_KEY, JSON.stringify(stats));
  return { jobs: current, stats };
}

/**
 * Dedupe jobs: first by id, then across sources by a normalized title+company
 * key (the same posting on vacancymail & jobszimbabwe has different ids). When
 * two match, keep the "richer" record (logo/email/salary/description).
 */
function dedupeJobs(jobs: JobListing[]): JobListing[] {
  const byId = Array.from(new Map(jobs.map((j) => [j.id, j])).values());
  const seen = new Map<string, JobListing>();
  for (const j of byId) {
    const key = `${j.title} ${j.company}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const prev = seen.get(key);
    if (!prev || richness(j) > richness(prev)) seen.set(key, j);
  }
  return Array.from(seen.values());
}

function richness(j: JobListing): number {
  return (
    (j.logo ? 1 : 0) +
    (j.applyEmail ? 1 : 0) +
    (j.salary && j.salary !== "TBA" ? 1 : 0) +
    Math.min((j.description?.length ?? 0) / 200, 3)
  );
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
