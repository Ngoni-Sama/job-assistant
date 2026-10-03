import type {
  Announcement,
  Application,
  AutoApplyLog,
  CandidateCard,
  CandidateCheck,
  Employer,
  Env,
  JobDetail,
  JobListing,
  Message,
  NotifyPrefs,
  NotifyType,
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
import { decodeEntities } from "./lib/scraping/shared";
import { isCurrent } from "./lib/utils/date";
import { categorize } from "./lib/categorize";
import { processCV } from "./lib/ai/extractor";
import { matchJobToCV } from "./lib/ai/matcher";
import { tailorApplication } from "./lib/ai/cvwriter";
import { sendApplication } from "./lib/email";
import { DEFAULT_PROMPTS, getConfig, saveConfig, type AppConfig, type PromptKey } from "./lib/ai/provider";
import { quickMatch, type QuickMatchRun } from "./lib/ai/quickmatch";
import { extractProfile } from "./lib/ai/profileextract";
import { cleanCvMarkdown } from "./lib/cvclean";
import { rankCandidates, indexDoc, type RagDoc } from "./lib/ai/rag";
import { charge, getCredits, addCredits, getCosts } from "./lib/credits";
import { writeAtsCv, type AtsCvInput } from "./lib/ai/atscv";
import { PACKS, createCheckoutSession, verifyWebhook } from "./lib/stripe";
import { CHECKS, findCheck } from "./lib/checks";
import { encryptToken, decryptToken, gtokenKey } from "./lib/tokens";
import { getAccessToken, sendGmail, GoogleAuthRevoked } from "./lib/gmail";
import {
  PUSH_SUBS_PREFIX,
  addSub,
  deleteSub,
  getSubs,
  getVapid,
  inQuietHours,
  isPushEndpoint,
  isTime,
  notifyEnabled,
  sendPush,
} from "./lib/push";
import { jobAlertText, jobsForUser, type SlimJob } from "./lib/alerts";
import { markSignedUsersSeen, requireSignedUsers, verifyUserToken } from "./lib/usertoken";

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
  "POST /api/apply/optimise",
  "POST /api/apply/send",
  "POST /api/auto-apply/run",
  "POST /api/match",
  "POST /api/match-all",
  "POST /api/quick-match",
  "POST /api/billing/checkout",
  "POST /api/employer",
  "POST /api/checks/order",
  "POST /api/cvs/create",
  "POST /api/recruiter/cvs",
  "DELETE /api/recruiter/cvs",
  "POST /api/recruiter/search",
  "POST /api/cvs/primary",
  "POST /api/cvs/rename",
  "POST /api/cvs/update",
  "DELETE /api/cvs",
  "POST /api/push/subscribe",
  "DELETE /api/push/subscribe",
  "POST /api/push/test",
  "POST /api/cv/ats-write",
]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return preflight();

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/" || path === "/api/health") {
        // `version` is a deploy marker — bump it to confirm auto-deploy shipped.
        return json({ ok: true, service: "job-assistant", version: "2026-10-03.1" });
      }

      // Who is calling? Only a token signed by the website's server proves it.
      // The plain x-user-id header is accepted only until the website starts
      // sending signed tokens (see lib/usertoken.ts), then refused.
      let userId = "demo";
      const userToken = request.headers.get("x-user-token");
      const claimed = request.headers.get("x-user-id");
      if (userToken) {
        const check = await verifyUserToken(env, userToken);
        if (check.ok) {
          userId = check.email;
          ctx.waitUntil(markSignedUsersSeen(env));
        } else if (check.reason === "unconfigured") {
          // This Worker has no INTERNAL_SECRET (e.g. local dev), so it can't verify.
          userId = claimed || "demo";
        } else {
          return json(
            {
              error: check.reason === "expired" ? "Your session expired — refresh the page." : "Invalid session — please sign in again.",
              code: `token_${check.reason}`,
            },
            { status: 401 },
          );
        }
      } else if (claimed && claimed !== "demo") {
        if (await requireSignedUsers(env)) {
          return json({ error: "Please refresh the page and sign in again.", code: "signed_required" }, { status: 401 });
        }
        userId = claimed;
      }

      // Data isolation: signed-out ("demo") callers may READ public data but must
      // not write per-user data or run paid AI actions — otherwise everyone
      // signed-out would share one "demo" space. Reads stay open (they return the
      // demo space, which stays empty because writes are blocked here).
      if (userId === "demo" && PROTECTED.has(`${request.method} ${path}`)) {
        return json({ error: "Please sign in to continue" }, { status: 401 });
      }

      // --- Billing / credits ---
      // Pesepay fulfilment (server-to-server from the Next.js app, which holds the
      // Pesepay keys). Guarded by a shared secret; crediting is idempotent per
      // payment reference so a callback + return-page verify can't double-credit.
      if (path.startsWith("/api/internal/")) {
        const secret = request.headers.get("x-internal-secret") ?? "";
        if (!env.INTERNAL_SECRET || secret !== env.INTERNAL_SECRET) {
          return json({ error: "Forbidden" }, { status: 403 });
        }
        if (path === "/api/internal/pending" && request.method === "POST") {
          const b = (await request.json()) as { reference?: string; userId?: string; credits?: number; amount?: number };
          if (!b.reference || !b.userId || !b.credits) return json({ error: "Invalid" }, { status: 400 });
          await env.JOBS_CACHE.put(
            `pending:${b.reference}`,
            JSON.stringify({ userId: b.userId, credits: b.credits, amount: b.amount ?? 0, at: new Date().toISOString() }),
            { expirationTtl: 60 * 60 * 24 * 3 },
          );
          return json({ ok: true });
        }
        // Store a Google refresh token for background auto-apply — ONLY for users
        // who turned auto-apply on. Called by the website at sign-in.
        if (path === "/api/internal/google-token" && request.method === "POST") {
          const b = (await request.json()) as { userId?: string; refreshToken?: string };
          if (!b.userId || !b.refreshToken) return json({ error: "Invalid" }, { status: 400 });
          const prefs = await getPrefs(env, b.userId);
          if (!prefs.autoApply) return json({ stored: false });
          await env.JOBS_CACHE.put(gtokenKey(b.userId), await encryptToken(env, b.refreshToken));
          return json({ stored: true });
        }
        // Attach Pesepay's own reference number to our pending record.
        if (path === "/api/internal/pending-map" && request.method === "POST") {
          const b = (await request.json()) as { reference?: string; pesepayRef?: string; pollUrl?: string };
          const key = `pending:${b.reference ?? ""}`;
          const pending = await env.JOBS_CACHE.get<Record<string, unknown>>(key, "json");
          if (!pending || !b.pesepayRef) return json({ error: "Unknown payment reference" }, { status: 404 });
          await env.JOBS_CACHE.put(key, JSON.stringify({ ...pending, pesepayRef: b.pesepayRef, pollUrl: b.pollUrl }), { expirationTtl: 60 * 60 * 24 * 3 });
          return json({ ok: true });
        }
        // Read a pending record (for verify: owner + Pesepay reference).
        if (path === "/api/internal/pending-get" && request.method === "POST") {
          const b = (await request.json()) as { reference?: string };
          const pending = await env.JOBS_CACHE.get<Record<string, unknown>>(`pending:${b.reference ?? ""}`, "json");
          const paid = await env.JOBS_CACHE.get(`paid:${b.reference ?? ""}`);
          if (!pending) return json({ error: "Unknown payment reference" }, { status: 404 });
          return json({ pending, paid: !!paid });
        }
        if (path === "/api/internal/credit" && request.method === "POST") {
          const b = (await request.json()) as { reference?: string; userId?: string; paidAmount?: number };
          if (!b.reference) return json({ error: "Invalid" }, { status: 400 });
          const done = await env.JOBS_CACHE.get(`paid:${b.reference}`);
          const pending = await env.JOBS_CACHE.get<{ userId: string; credits: number; amount: number }>(`pending:${b.reference}`, "json");
          if (done) {
            const owner = pending?.userId ?? b.userId ?? "";
            return json({ credited: 0, already: true, balance: owner ? await getCredits(env, owner) : null });
          }
          if (!pending) return json({ error: "Unknown payment reference" }, { status: 404 });
          if (b.userId && b.userId !== pending.userId) return json({ error: "Reference belongs to another user" }, { status: 403 });
          // Guard against paying a small amount for a big pack.
          if (typeof b.paidAmount === "number" && pending.amount && b.paidAmount + 0.001 < pending.amount) {
            return json({ error: "Paid amount is less than the pack price" }, { status: 402 });
          }
          await env.JOBS_CACHE.put(`paid:${b.reference}`, JSON.stringify({ userId: pending.userId, credits: pending.credits, at: new Date().toISOString() }));
          const balance = await addCredits(env, pending.userId, pending.credits);
          ctx.waitUntil(
            notify(env, pending.userId, "credits", {
              title: "Top-up successful",
              body: `${pending.credits} credits added. Your balance is now ${balance}.`,
              url: "/billing",
              tag: "credits",
            }),
          );
          return json({ credited: pending.credits, balance });
        }
        return json({ error: "Not found" }, { status: 404 });
      }

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
        return json({ balance: await getCredits(env, userId), costs: await getCosts(env) });
      }
      if (path === "/api/billing/packs" && request.method === "GET") {
        const cfg = await getConfig(env);
        return json({
          packs: cfg.packs.length ? cfg.packs : PACKS,
          provider: cfg.payments.provider,
          currency: cfg.payments.currency,
        });
      }
      // Public, non-secret site settings (name, tagline, payment provider…).
      if (path === "/api/site" && request.method === "GET") {
        const cfg = await getConfig(env);
        return json({
          site: cfg.site,
          payments: { provider: cfg.payments.provider, currency: cfg.payments.currency, freeCredits: cfg.payments.freeCredits },
          costs: cfg.costs, // credit price per action (public — shown on /pricing)
        });
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

      // --- Push notifications ---
      // The public key a browser needs to subscribe (safe to expose).
      if (path === "/api/push/key" && request.method === "GET") {
        return json({ publicKey: (await getVapid(env)).publicKey });
      }
      if (path === "/api/push/subscribe" && request.method === "POST") {
        const b = (await request.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth || !isPushEndpoint(b.endpoint)) {
          return json({ error: "Invalid subscription" }, { status: 400 });
        }
        const devices = await addSub(env, userId, {
          endpoint: b.endpoint,
          p256dh: b.keys.p256dh,
          auth: b.keys.auth,
          ua: (request.headers.get("user-agent") ?? "").slice(0, 160),
          at: new Date().toISOString(),
        });
        return json({ ok: true, devices });
      }
      if (path === "/api/push/subscribe" && request.method === "DELETE") {
        const b = (await request.json()) as { endpoint?: string };
        if (b.endpoint) await deleteSub(env, userId, b.endpoint);
        return json({ ok: true });
      }
      // Send a test notification to the caller's own devices.
      if (path === "/api/push/test" && request.method === "POST") {
        const prefs = await getPrefs(env, userId);
        const sent = await sendPush(
          env,
          userId,
          {
            type: "test",
            title: "VacancyPal notifications are on",
            body: "You'll hear about new jobs, employer messages and auto-apply here.",
            url: "/settings#notifications",
            tag: "test",
            silent: prefs.notify?.sound === false || inQuietHours(prefs.notify),
          },
          { ttl: 60, urgency: "high" },
        );
        return json({ ok: true, sent });
      }
      // Unread messages (for the nav badge) + how many devices get my notifications.
      if (path === "/api/unread" && request.method === "GET") {
        if (userId === "demo") return json({ messages: 0, devices: 0 });
        const [messages, subs] = await Promise.all([unreadTotal(env, userId), getSubs(env, userId)]);
        return json({ messages, devices: subs.length });
      }

      // Upload + process a CV (PDF → Markdown)
      if (path === "/api/upload-cv" && request.method === "POST") {
        const form = await request.formData();
        const file = form.get("cv");
        if (!file || typeof file === "string") {
          return json({ error: "Expected a 'cv' file field" }, { status: 400 });
        }
        const stored = await processCV(file, env, userId);
        ctx.waitUntil(indexCandidate(env, userId)); // re-index if this user is a searchable candidate
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
        // Prefer the per-CV file; fall back to the primary file record for CVs
        // uploaded before per-id storage (or migrated legacy CVs).
        let file = await env.JOBS_CACHE.get(id ? `cvfile:${userId}:${id}` : `cvfile:${userId}`, "json");
        if (!file && id) file = await env.JOBS_CACHE.get(`cvfile:${userId}`, "json");
        if (!file) return json({ error: "No original CV on file" }, { status: 404 });
        return json(file);
      }

      // ATS CV Creator: AI writes the CV from the user's details (paid).
      // Credits are refunded if the AI can't produce a usable CV.
      if (path === "/api/cv/ats-write" && request.method === "POST") {
        const body = (await request.json().catch(() => null)) as Partial<AtsCvInput> | null;
        const text = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
        const input: AtsCvInput = {
          targetRole: text(body?.targetRole, 120),
          jobDescription: text(body?.jobDescription, 8000),
          headline: text(body?.headline, 120),
          summary: text(body?.summary, 2000),
          experience: (Array.isArray(body?.experience) ? body!.experience : [])
            .slice(0, 12)
            .map((e) => ({
              role: text(e?.role, 120),
              company: text(e?.company, 120),
              start: text(e?.start, 40),
              end: text(e?.end, 40),
              details: text(e?.details, 3000),
            }))
            .filter((e) => e.role || e.company),
          education: (Array.isArray(body?.education) ? body!.education : [])
            .slice(0, 8)
            .map((e) => ({ qualification: text(e?.qualification, 160), institution: text(e?.institution, 160), year: text(e?.year, 20) }))
            .filter((e) => e.qualification || e.institution),
          skills: (Array.isArray(body?.skills) ? body!.skills : []).map((s) => text(s, 60).trim()).filter(Boolean).slice(0, 40),
          certifications: (Array.isArray(body?.certifications) ? body!.certifications : []).map((s) => text(s, 160).trim()).filter(Boolean).slice(0, 15),
          languages: text(body?.languages, 200),
        };
        if (!input.experience.length && !input.summary && !input.skills.length) {
          return json({ error: "Add at least a role, a summary or some skills first." }, { status: 400 });
        }
        const { atsCv: atsCost } = await getCosts(env);
        const paid = await charge(env, userId, atsCost);
        if (!paid.ok) {
          return json({ error: "Not enough credits to write your CV", balance: paid.balance, cost: atsCost }, { status: 402 });
        }
        try {
          const cv = await writeAtsCv(env, input);
          return json({ cv, balance: paid.balance, cost: atsCost });
        } catch (err) {
          console.error("ATS CV writer failed", err);
          const balance = atsCost ? await addCredits(env, userId, atsCost) : paid.balance; // refund
          return json({ error: "The AI couldn't write your CV just now — you haven't been charged. Please try again.", balance }, { status: 502 });
        }
      }

      // --- Multiple CVs ---
      if (path === "/api/cvs" && request.method === "GET") {
        if (userId === "demo") return json({ cvs: [], primaryId: null });
        const cvs = await getCvList(env, userId);
        const primary = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        return json({ cvs, primaryId: primary?.id ?? cvs[cvs.length - 1]?.id ?? null });
      }
      // Create a CV from the guided builder (markdown + an optional generated file).
      if (path === "/api/cvs/create" && request.method === "POST") {
        const { fileName, markdown, fileData, fileType } = (await request.json()) as {
          fileName?: string;
          markdown?: string;
          fileData?: string;
          fileType?: string;
        };
        if (!markdown?.trim()) return json({ error: "CV is empty" }, { status: 400 });
        const id = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const name = (fileName?.trim() || "My CV").slice(0, 80);
        const stored: StoredCV = {
          id,
          key: `cvs/${userId}/${id}`,
          fileName: name,
          markdown,
          uploadedAt: new Date().toISOString(),
        };
        const cvs = await getCvList(env, userId);
        cvs.push(stored);
        await env.JOBS_CACHE.put(`cvs:${userId}`, JSON.stringify(cvs));
        await env.JOBS_CACHE.put(`cv:${userId}`, JSON.stringify(stored)); // make it primary
        if (fileData) {
          const rec = JSON.stringify({
            name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`,
            type: fileType || "application/pdf",
            data: fileData,
          });
          await env.JOBS_CACHE.put(`cvfile:${userId}:${id}`, rec);
          await env.JOBS_CACHE.put(`cvfile:${userId}`, rec);
        }
        return json({ cv: stored, cvs });
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

      // Trigger a scrape across all enabled sources. Admin-only: the cron already
      // scrapes every 6h, and an open route let anyone hammer the job boards.
      if (path === "/api/scrape" && request.method === "POST") {
        if (userId === "demo") return json({ error: "Please sign in to continue" }, { status: 401 });
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const { jobs, stats } = await runScrape(env);
        ctx.waitUntil(processJobAlerts(env));
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

        const detailKey = `jobdetail:v2:${id}`; // v2 = structured parser (2026-09-30); v1 entries expire on their own
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

        const { matchAll: matchAllCost } = await getCosts(env);
        const paidMatch = await charge(env, userId, matchAllCost);
        if (!paidMatch.ok) {
          return json(
            { error: "Not enough credits to match all jobs", balance: paidMatch.balance, cost: matchAllCost },
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
            payments: { ...current.payments, ...(patch.payments ?? {}) },
            site: { ...current.site, ...(patch.site ?? {}) },
            packs: Array.isArray(patch.packs)
              ? patch.packs
                  .filter((p) => p && p.id && p.credits > 0 && p.priceCents > 0)
                  .map((p) => ({ id: String(p.id), label: String(p.label || p.id), credits: Math.round(p.credits), priceCents: Math.round(p.priceCents) }))
              : current.packs,
            costs: patch.costs ? cleanCosts(patch.costs, current.costs) : current.costs,
            prompts: patch.prompts ? cleanPrompts(patch.prompts, current.prompts) : current.prompts,
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

      // The built-in AI instructions (shown as the starting point in the editor).
      if (path === "/api/admin/prompts/defaults" && request.method === "GET") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        return json({ prompts: DEFAULT_PROMPTS });
      }

      // Check the saved OpenAI key really works (lists models; costs nothing).
      if (path === "/api/admin/openai/test" && request.method === "POST") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const cfg = await getConfig(env);
        if (!cfg.openaiApiKey) return json({ ok: false, message: "No OpenAI key saved yet." });
        try {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${cfg.openaiApiKey}` },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = (await res.json()) as { data?: { id: string }[] };
            const hasModel = (data.data ?? []).some((m) => m.id === cfg.openaiModel);
            return json({
              ok: true,
              message: hasModel
                ? `Key works, and model "${cfg.openaiModel}" is available.`
                : `Key works, but model "${cfg.openaiModel}" isn't available to this key — pick another model.`,
            });
          }
          return json({
            ok: false,
            message:
              res.status === 401
                ? "OpenAI rejected this key (401). Check it was copied correctly."
                : res.status === 429
                  ? "OpenAI says the account has no quota left (429). Check billing on platform.openai.com."
                  : `OpenAI returned HTTP ${res.status}.`,
          });
        } catch {
          return json({ ok: false, message: "Couldn't reach OpenAI — try again." });
        }
      }

      // Users: everyone who has used VacancyPal while signed in, with counts.
      if (path === "/api/admin/users" && request.method === "GET") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        return json(await listUsers(env, offset, q));
      }
      // Add or remove credits for a user (support, refunds, promotions).
      if (path === "/api/admin/credits" && request.method === "POST") {
        if (!(await isAdmin(env, userId))) return json({ error: "Forbidden" }, { status: 403 });
        const b = (await request.json()) as { userId?: string; amount?: number };
        const amount = Math.round(Number(b.amount));
        if (!b.userId?.includes("@") || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000) {
          return json({ error: "Give a user and a non-zero amount" }, { status: 400 });
        }
        const current = await getCredits(env, b.userId);
        const balance = await addCredits(env, b.userId, Math.max(amount, -current)); // never below zero
        return json({ balance });
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

        const { quickMatch: quickCost } = await getCosts(env);
        const paid = await charge(env, userId, quickCost);
        if (!paid.ok) {
          return json(
            { error: "Not enough credits for Quick Match", balance: paid.balance, cost: quickCost },
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
        const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
        const next: Profile = {
          // Keep everything already on the profile (name, skills… from CV auto-fill).
          ...current,
          availability: patch.availability ?? current.availability,
          headline: (patch.headline ?? current.headline).slice(0, 120),
          sector: patch.sector ?? current.sector,
          mainProfession:
            patch.mainProfession !== undefined ? clean(patch.mainProfession, 60) || undefined : current.mainProfession,
          otherRoles: Array.isArray(patch.otherRoles)
            ? [...new Set(patch.otherRoles.map((r) => clean(r, 60)).filter(Boolean))].slice(0, MAX_OTHER_ROLES)
            : current.otherRoles,
          updatedAt: new Date().toISOString(),
        };
        await env.JOBS_CACHE.put(profileKey(userId), JSON.stringify(next));
        ctx.waitUntil(indexCandidate(env, userId)); // keep the talent-search index fresh
        return json({ profile: next });
      }
      // Auto-fill the profile from the user's uploaded CV via AI.
      if (path === "/api/profile/from-cv" && request.method === "POST") {
        const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
        if (!cv) return json({ error: "Upload a CV first" }, { status: 400 });
        const paid = await charge(env, userId, (await getCosts(env)).optimise);
        if (!paid.ok) {
          return json({ error: "Not enough credits", balance: paid.balance }, { status: 402 });
        }
        const extracted = await extractProfile(cv.markdown, env);
        const current = await getProfile(env, userId);
        const next: Profile = { ...current, ...extracted, updatedAt: new Date().toISOString() };
        await env.JOBS_CACHE.put(profileKey(userId), JSON.stringify(next));
        ctx.waitUntil(indexCandidate(env, userId));
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

      // Recruiter CV pool — upload candidate CVs to search over. Approved only.
      if (path === "/api/recruiter/cvs") {
        const employer = await getEmployer(env, userId);
        if (employer?.status !== "approved") {
          return json({ error: "Approved employer account required" }, { status: 403 });
        }
        const rkey = `rcv:${userId}`;
        type RCv = { id: string; fileName: string; name: string; headline: string; sector: string; location: string; markdown: string; uploadedAt: string };
        const listAll = async () => (await env.JOBS_CACHE.get<RCv[]>(rkey, "json")) ?? [];
        if (request.method === "GET") {
          const list = await listAll();
          return json({ cvs: list.map(({ markdown: _m, ...meta }) => meta) });
        }
        if (request.method === "POST") {
          const form = await request.formData();
          const entry = form.get("cv");
          if (!entry || typeof entry === "string") return json({ error: "No CV file" }, { status: 400 });
          const file = entry as File;
          let markdown = "";
          try {
            const results = await env.AI.toMarkdown([
              { name: file.name, blob: new Blob([await file.arrayBuffer()], { type: file.type || "application/pdf" }) },
            ]);
            const first = results?.[0];
            markdown = first && "data" in first ? first.data : "";
          } catch (err) {
            console.error("recruiter toMarkdown failed", err);
          }
          markdown = cleanCvMarkdown(markdown);
          const id = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const field = (n: string) => (form.get(n)?.toString() ?? "").trim();
          const firstLine = markdown.split("\n").map((l) => l.replace(/[#*_>-]/g, "").trim()).find(Boolean) ?? "";
          const name = field("name") || (firstLine.length <= 40 ? firstLine : "") || file.name.replace(/\.[^.]+$/, "");
          const rec: RCv = { id, fileName: file.name, name, headline: field("headline"), sector: field("sector"), location: field("location"), markdown, uploadedAt: new Date().toISOString() };
          const list = await listAll();
          list.push(rec);
          await env.JOBS_CACHE.put(rkey, JSON.stringify(list));
          // Index the uploaded CV so search doesn't have to embed it on-demand.
          const docText = [rec.headline, rec.markdown].filter(Boolean).join("\n").trim();
          if (docText) {
            ctx.waitUntil(
              indexDoc(env, { id: rec.id, name: rec.name, headline: rec.headline, sector: rec.sector, location: rec.location, skills: [], source: "mine", text: docText }),
            );
          }
          const { markdown: _m, ...meta } = rec;
          return json({ cv: meta });
        }
        if (request.method === "DELETE") {
          const { id } = (await request.json()) as { id?: string };
          const list = (await listAll()).filter((c) => c.id !== id);
          await env.JOBS_CACHE.put(rkey, JSON.stringify(list));
          return json({ ok: true });
        }
      }

      // Recruiter RAG candidate search. Approved employers only.
      if (path === "/api/recruiter/search" && request.method === "POST") {
        const employer = await getEmployer(env, userId);
        if (employer?.status !== "approved") {
          return json({ error: "Approved employer account required" }, { status: 403 });
        }
        const body = (await request.json()) as {
          query?: string;
          sector?: string;
          location?: string;
          pool?: "all" | "platform" | "mine";
          excludeIds?: string[];
          limit?: number;
        };
        const query = body.query?.trim();
        if (!query) return json({ error: "Describe the candidate you're looking for" }, { status: 400 });
        const pool = body.pool ?? "all";
        const exclude = new Set(body.excludeIds ?? []);
        const sector = body.sector?.trim();
        const location = body.location?.trim().toLowerCase();
        const docs: RagDoc[] = [];

        if (pool !== "mine") {
          const { keys } = await env.JOBS_CACHE.list({ prefix: "profile:" });
          for (const k of keys) {
            if (docs.length >= 60) break;
            const email = k.name.slice("profile:".length);
            if (exclude.has(candidateId(email))) continue;
            const doc = await buildCandidateDoc(env, email);
            if (!doc) continue;
            if (sector && doc.sector !== sector) continue;
            if (location && !(doc.location ?? "").toLowerCase().includes(location)) continue;
            await env.JOBS_CACHE.put(`cidmap:${doc.id}`, email);
            docs.push(doc);
          }
        }
        if (pool !== "platform") {
          type RCv = { id: string; name: string; headline: string; sector: string; location: string; markdown: string };
          const mine = (await env.JOBS_CACHE.get<RCv[]>(`rcv:${userId}`, "json")) ?? [];
          for (const c of mine) {
            if (exclude.has(c.id)) continue;
            if (sector && c.sector && c.sector !== sector) continue;
            if (location && c.location && !c.location.toLowerCase().includes(location)) continue;
            const text = [c.headline, c.markdown].filter(Boolean).join("\n").trim();
            if (!text) continue;
            docs.push({ id: c.id, name: c.name, headline: c.headline, sector: c.sector, location: c.location, skills: [], source: "mine", text });
          }
        }

        const limit = Math.min(Math.max(body.limit ?? 10, 1), 15);
        return json(await rankCandidates(env, query, docs, limit));
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
          if (!list.some((c) => c.id === candidate.id)) {
            list.push(candidate);
            const email = await env.JOBS_CACHE.get(`cidmap:${candidate.id}`);
            if (email) {
              ctx.waitUntil(
                notify(env, email, "interest", {
                  title: "An employer shortlisted you",
                  body: `${employer.company} added you to their shortlist. Keep your profile and CV up to date.`,
                  url: "/profile",
                  tag: "interest",
                }),
              );
            }
          }
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
        ctx.waitUntil(afterMessage(env, thread, "employer"));
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
        ctx.waitUntil(afterMessage(env, updated, role));
        // Replying means I've seen everything above.
        const readAt = await markThreadRead(env, updated, role, userId);
        return json({ thread: { ...updated, readAt } });
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
        const role = participantRole(thread, userId);
        if (!role) return json({ error: "Not a participant" }, { status: 403 });
        // Opening the thread marks the other side's messages as read.
        const readAt = await markThreadRead(env, thread, role, userId);
        return json({ thread: { ...thread, readAt } });
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

        const { unlockContact: unlockCost } = await getCosts(env);
        const paid = await charge(env, userId, unlockCost);
        if (!paid.ok) {
          return json({ error: "Not enough credits", balance: paid.balance, cost: unlockCost }, { status: 402 });
        }
        unlocked[cid] = email;
        await env.JOBS_CACHE.put(ukey, JSON.stringify(unlocked));
        ctx.waitUntil(
          notify(env, email, "interest", {
            title: "An employer unlocked your contact",
            body: `${employer.company} can now contact you about a role. Watch your email and messages.`,
            url: "/messages",
            tag: "interest",
          }),
        );
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
        const cur = await getPrefs(env, userId);
        const list = (v: unknown, fallback: string[] = []) =>
          Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 30) : fallback;
        const prefs: Prefs = {
          autoApply: body.autoApply ?? cur.autoApply,
          categories: body.categories ?? cur.categories,
          autoApplySectors: body.autoApplySectors !== undefined ? list(body.autoApplySectors) : cur.autoApplySectors ?? [],
          autoApplyKeywords: body.autoApplyKeywords !== undefined ? list(body.autoApplyKeywords) : cur.autoApplyKeywords ?? [],
          autoApplyDailyLimit: Math.min(20, Math.max(1, Math.round(Number(body.autoApplyDailyLimit ?? cur.autoApplyDailyLimit ?? 5)) || 5)),
          autoApplyUseAI: body.autoApplyUseAI ?? cur.autoApplyUseAI ?? false,
          notify: mergeNotify(cur.notify, body.notify),
        };
        await env.JOBS_CACHE.put(prefsKey(userId), JSON.stringify(prefs));
        // Turning auto-apply off removes the stored Google token immediately.
        if (!prefs.autoApply) await env.JOBS_CACHE.delete(gtokenKey(userId));
        return json({ prefs });
      }

      // Auto-apply status for the signed-in user.
      if (path === "/api/auto-apply" && request.method === "GET") {
        const cfg = await getConfig(env);
        const log = (await env.JOBS_CACHE.get<AutoApplyLog>(autoLogKey(userId), "json")) ?? { sent: [] };
        const dayAgo = Date.now() - 24 * 3600 * 1000;
        return json({
          allowed: cfg.features.autoApplyAllowed,
          authorized: !!(await env.JOBS_CACHE.get(gtokenKey(userId))),
          sentToday: log.sent.filter((s) => Date.parse(s.at) > dayAgo).length,
          lastRun: log.lastRun ?? null,
          lastError: log.lastError ?? null,
          recent: log.sent.slice(-10).reverse(),
        });
      }
      // Run auto-apply now for the signed-in user (rate-limited).
      if (path === "/api/auto-apply/run" && request.method === "POST") {
        const log = (await env.JOBS_CACHE.get<AutoApplyLog>(autoLogKey(userId), "json")) ?? { sent: [] };
        if (log.lastRun && Date.now() - Date.parse(log.lastRun) < 5 * 60 * 1000) {
          return json({ error: "Auto-apply ran in the last 5 minutes — try again shortly." }, { status: 429 });
        }
        const result = await autoApplyForUser(env, userId, await getJobs(env));
        return json(result);
      }

      // Which jobs the user has applied to
      if (path === "/api/applied" && request.method === "GET") {
        return json({ applied: await getApplied(env, userId) });
      }

      // Prepare an application — FREE, no AI. Uses the original CV and a simple
      // templated cover note. Auto-sends only when the user opted into autoApply.
      if (path === "/api/apply/prepare" && request.method === "POST") {
        const { jobId, cvId } = (await request.json()) as { jobId?: string; cvId?: string };
        const cv = await resolveCv(env, userId, cvId);
        if (!cv) return json({ error: "No CV uploaded yet" }, { status: 400 });
        const job = (await getJobs(env)).find((j) => j.id === jobId);
        if (!job) return json({ error: "Job not found" }, { status: 404 });

        const detail = await fetchJobDetail(job.applyLink);
        const application: Application = {
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          to: detail.applyEmail,
          phone: detail.applyPhone,
          deadline: detail.deadline,
          applyText: detail.applyText,
          subject: `Application: ${job.title}${job.company !== "N/A" ? ` — ${job.company}` : ""}`,
          coverNote: templateCoverNote(job),
          tailoredCV: cv.markdown,
          generatedAt: new Date().toISOString(),
          optimised: false,
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

      // Optimise an application with AI — PAID. Tailors the CV + cover note to
      // the job. Charged only when the user explicitly asks for it.
      if (path === "/api/apply/optimise" && request.method === "POST") {
        const { jobId, cvId } = (await request.json()) as { jobId?: string; cvId?: string };
        const cv = await resolveCv(env, userId, cvId);
        if (!cv) return json({ error: "No CV uploaded yet" }, { status: 400 });
        const job = (await getJobs(env)).find((j) => j.id === jobId);
        if (!job) return json({ error: "Job not found" }, { status: 404 });

        const { optimise: optimiseCost } = await getCosts(env);
        const paid = await charge(env, userId, optimiseCost);
        if (!paid.ok) {
          return json(
            { error: "Not enough credits to optimise a CV", balance: paid.balance, cost: optimiseCost },
            { status: 402 },
          );
        }
        const detail = await fetchJobDetail(job.applyLink);
        const tailored = await tailorApplication(cv.markdown, job, detail, env);

        // Preserve any existing prepared record (e.g. sent state) if present.
        const prev = await env.JOBS_CACHE.get<Application>(appKey(userId, job.id), "json");
        const application: Application = {
          ...(prev ?? {}),
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
          optimised: true,
        };
        await env.JOBS_CACHE.put(appKey(userId, job.id), JSON.stringify(application));
        return json({ application, balance: paid.balance });
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

  // Cron: "0 */6 * * *" refreshes the job cache; AUTO_APPLY_CRON runs auto-apply
  // in its own invocation (separate time/subrequest budget).
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === AUTO_APPLY_CRON) {
      // Finish any job alerts the last scrape didn't get to, then auto-apply.
      await processJobAlerts(env).catch((err) => console.error("job alerts failed", err));
      await runAutoApply(env);
    } else {
      await runScrape(env);
      await processJobAlerts(env).catch((err) => console.error("job alerts failed", err));
    }
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
  const unread = await getUnread(env, userId);
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
      unreadFrom: unread[t.id] && last && last.from !== role ? last.from : null,
      unread: unread[t.id] ?? 0,
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
/** Assemble the searchable RAG doc for a platform candidate (profile + primary CV). */
async function buildCandidateDoc(env: Env, email: string): Promise<RagDoc | null> {
  const pr = await env.JOBS_CACHE.get<Profile>(profileKey(email), "json");
  if (!pr || pr.availability === "not_looking") return null;
  const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${email}`, "json");
  const roles = [pr.mainProfession, ...(pr.otherRoles ?? [])].filter(Boolean).join(", ");
  const text = [roles, pr.headline, (pr.skills ?? []).join(", "), pr.education, cv?.markdown ?? ""].filter(Boolean).join("\n").trim();
  if (!text) return null;
  const cid = candidateId(email);
  // The main profession leads the headline so it shows on search results too.
  const headline = pr.mainProfession && !pr.headline.toLowerCase().includes(pr.mainProfession.toLowerCase())
    ? [pr.mainProfession, pr.headline].filter(Boolean).join(" · ")
    : pr.headline;
  return { id: cid, name: pr.name || "Candidate", headline, sector: pr.sector || "Other", location: pr.location, skills: pr.skills, source: "platform", text };
}

/** Re-index a candidate after their profile or CV changes (write-time embedding). */
async function indexCandidate(env: Env, email: string): Promise<void> {
  const doc = await buildCandidateDoc(env, email);
  if (!doc) return;
  await env.JOBS_CACHE.put(`cidmap:${doc.id}`, email);
  await indexDoc(env, doc);
}

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
      mainProfession: p.mainProfession,
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

/** A simple, non-AI cover note used by the free "Apply" path. */
function templateCoverNote(job: JobListing): string {
  const at = job.company && job.company !== "N/A" ? ` at ${job.company}` : "";
  return (
    `Dear Hiring Manager,\n\n` +
    `I would like to apply for the ${job.title} position${at}. ` +
    `My CV is attached for your consideration. I believe my background and skills make me a strong fit for this role, ` +
    `and I would welcome the opportunity to discuss how I can contribute to your team.\n\n` +
    `Thank you for your time and consideration.`
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Auto-apply: background job that applies to matching jobs from the user's Gmail
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_APPLY_CRON = "30 */3 * * *"; // must match a [triggers] cron in wrangler.toml
const autoLogKey = (userId: string) => `autoapply:${userId}`;
const AUTO_MAX_DETAIL_FETCHES = 10; // per user per run (bounds subrequests)
const AUTO_MAX_USERS_PER_RUN = 25;

/** Cron entry point: run auto-apply for every user who authorized it. */
async function runAutoApply(env: Env): Promise<void> {
  const cfg = await getConfig(env);
  if (!cfg.features.autoApplyAllowed) return;
  const { keys } = await env.JOBS_CACHE.list({ prefix: "gtoken:" });
  if (!keys.length) return;
  const jobs = await getJobs(env);
  for (const k of keys.slice(0, AUTO_MAX_USERS_PER_RUN)) {
    const userId = k.name.slice("gtoken:".length);
    try {
      const result = await autoApplyForUser(env, userId, jobs);
      if (result.sent > 0) {
        const titles = result.titles ?? [];
        await notify(env, userId, "autoApply", {
          title: `Auto-apply sent ${result.sent} application${result.sent === 1 ? "" : "s"}`,
          body: titles.slice(0, 2).join(" · ") + (titles.length > 2 ? ` and ${titles.length - 2} more` : ""),
          url: "/applications",
          tag: "auto-apply",
        });
      } else if (result.error && /authorize Gmail again/i.test(result.error)) {
        await notify(env, userId, "autoApply", {
          title: "Auto-apply needs your attention",
          body: result.error,
          url: "/settings",
          tag: "auto-apply",
        });
      }
    } catch (err) {
      console.error("auto-apply failed for", userId, err);
    }
  }
}

/** A job qualifies if it matches a chosen sector OR keyword (and job type, if set). */
function matchesAutoApply(job: JobListing, prefs: Prefs): boolean {
  const sectors = prefs.autoApplySectors ?? [];
  const keywords = (prefs.autoApplyKeywords ?? []).map((k) => k.toLowerCase());
  if (!sectors.length && !keywords.length) return false; // never "apply to everything"
  const title = job.title.toLowerCase();
  const sectorOk = sectors.length > 0 && !!job.sector && sectors.includes(job.sector);
  const keywordOk = keywords.length > 0 && keywords.some((k) => title.includes(k));
  if (!sectorOk && !keywordOk) return false;
  if (prefs.categories?.length && job.jobType && !prefs.categories.includes(job.jobType)) return false;
  return isCurrent(job.expiryDate);
}

/**
 * Apply to new matching jobs for one user, from their own Gmail, within their
 * daily limit. Never applies to the same job twice or emails the same employer
 * address twice within 30 days. Records everything in the Applications list.
 */
async function autoApplyForUser(
  env: Env,
  userId: string,
  jobs: JobListing[],
): Promise<{ sent: number; error?: string; titles?: string[] }> {
  const log: AutoApplyLog = (await env.JOBS_CACHE.get<AutoApplyLog>(autoLogKey(userId), "json")) ?? { sent: [] };
  const titles: string[] = []; // jobs applied to in this run
  const finish = async (sent: number, error?: string) => {
    log.lastRun = new Date().toISOString();
    log.lastError = error;
    log.sent = log.sent.slice(-100);
    await env.JOBS_CACHE.put(autoLogKey(userId), JSON.stringify(log));
    return { sent, error, titles };
  };

  if (!(await getConfig(env)).features.autoApplyAllowed) return finish(0, "Auto-apply is switched off by the site admin.");
  const prefs = await getPrefs(env, userId);
  if (!prefs.autoApply) {
    await env.JOBS_CACHE.delete(gtokenKey(userId));
    return finish(0, "Auto-apply is off.");
  }
  const stored = await env.JOBS_CACHE.get(gtokenKey(userId));
  if (!stored) return finish(0, "Not authorized yet — use “Authorize Gmail” in Settings → Auto-apply.");
  if (!prefs.autoApplySectors?.length && !prefs.autoApplyKeywords?.length) {
    return finish(0, "Pick at least one sector or keyword to auto-apply to.");
  }
  const cv = await env.JOBS_CACHE.get<StoredCV>(`cv:${userId}`, "json");
  if (!cv?.markdown) return finish(0, "Upload or build a CV first.");

  const now = Date.now();
  let remaining = (prefs.autoApplyDailyLimit ?? 5) - log.sent.filter((s) => Date.parse(s.at) > now - 86_400_000).length;
  if (remaining <= 0) return finish(0);
  const recentTo = new Set(
    log.sent.filter((s) => Date.parse(s.at) > now - 30 * 86_400_000).map((s) => s.to.toLowerCase()),
  );
  const applied = new Set(await getApplied(env, userId));
  const candidates = jobs.filter((j) => !applied.has(j.id) && matchesAutoApply(j, prefs));
  if (!candidates.length) return finish(0);

  let accessToken: string;
  try {
    accessToken = await getAccessToken(env, await decryptToken(env, stored));
  } catch (err) {
    if (err instanceof GoogleAuthRevoked) {
      await env.JOBS_CACHE.delete(gtokenKey(userId));
      return finish(0, "Google access was removed — authorize Gmail again in Settings → Auto-apply.");
    }
    return finish(0, (err as Error).message);
  }

  const profile = await getProfile(env, userId);
  const { optimise: optimiseCost } = await getCosts(env);
  const file = await env.JOBS_CACHE.get<{ name: string; type: string; data: string }>(`cvfile:${userId}`, "json");
  let detailFetches = 0;
  let sent = 0;

  for (const job of candidates) {
    if (remaining <= 0) break;
    const detailKey = `jobdetail:v2:${job.id}`;
    let detail = await env.JOBS_CACHE.get<JobDetail>(detailKey, "json");
    if (!detail) {
      if (detailFetches >= AUTO_MAX_DETAIL_FETCHES) break;
      detailFetches++;
      try {
        detail = await fetchJobDetail(job.applyLink);
        await env.JOBS_CACHE.put(detailKey, JSON.stringify(detail), { expirationTtl: 60 * 60 * 24 * 7 });
      } catch {
        continue;
      }
    }
    const to = (detail.applyEmail ?? job.applyEmail)?.trim();
    if (!to || recentTo.has(to.toLowerCase())) continue; // portal-only jobs are skipped

    // Cover note: free template, or AI-tailored when the user opted in (charged per job).
    let coverNote = templateCoverNote(job);
    let optimised = false;
    if (prefs.autoApplyUseAI && (await charge(env, userId, optimiseCost)).ok) {
      try {
        const t = await tailorApplication(cv.markdown, job, detail, env);
        if (t.coverNote) {
          coverNote = t.coverNote;
          optimised = true;
        }
      } catch {
        await addCredits(env, userId, optimiseCost); // refund on AI failure
      }
    }

    const subject = `Application: ${job.title}${job.company !== "N/A" ? ` — ${job.company}` : ""}`;
    const signature = `— ${profile.name || userId} · ${userId}`;
    // Attach the uploaded CV; if there's no file on record, include the CV text instead.
    const body = `${coverNote}\n\n${signature}${file ? "" : `\n\n---\n\n${cv.markdown}`}`;
    try {
      await sendGmail(accessToken, { from: userId, to, subject, body, attachment: file ?? null });
    } catch (err) {
      if (err instanceof GoogleAuthRevoked) {
        await env.JOBS_CACHE.delete(gtokenKey(userId));
        return finish(sent, "Google access was removed — authorize Gmail again in Settings → Auto-apply.");
      }
      // A send failure (e.g. Gmail API disabled) would repeat for every job — stop this run.
      return finish(sent, (err as Error).message);
    }

    const at = new Date().toISOString();
    const application: Application = {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      to,
      phone: detail.applyPhone,
      deadline: detail.deadline,
      applyText: detail.applyText,
      subject,
      coverNote,
      tailoredCV: cv.markdown,
      generatedAt: at,
      sent: true,
      sentAt: at,
      method: "email",
      optimised,
      auto: true,
    };
    await env.JOBS_CACHE.put(appKey(userId, job.id), JSON.stringify(application));
    applied.add(job.id);
    await env.JOBS_CACHE.put(appliedKey(userId), JSON.stringify([...applied]));
    log.sent.push({ jobId: job.id, title: job.title, company: job.company, to, at });
    titles.push(job.title);
    recentTo.add(to.toLowerCase());
    remaining--;
    sent++;
  }
  return finish(sent);
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
  const known = new Set([...existingCurrent, ...existingExpired].map(postingKey));
  const deduped = dedupeJobs([...existingCurrent, ...existingExpired, ...collected]);

  // Classify sector for every job (re-runs on older entries too), and keep the
  // date we first saw each posting (job pages publish it as datePosted).
  const firstSeen = new Map<string, string>();
  for (const j of [...existingCurrent, ...existingExpired]) {
    if (!j.firstSeen) continue;
    firstSeen.set(j.id, j.firstSeen);
    firstSeen.set(postingKey(j), j.firstSeen);
  }
  const now = new Date().toISOString();
  // Some boards double-encode entities ("&amp;#8211;"), so decode twice; this also
  // cleans jobs stored before the fix.
  const clean = (s: string) => decodeEntities(decodeEntities(s ?? "")).replace(/\s+/g, " ").trim();
  for (const job of deduped) {
    job.title = clean(job.title);
    job.company = clean(job.company);
    job.location = clean(job.location);
    job.sector = categorize(job.title, job.description);
    job.firstSeen = job.firstSeen || firstSeen.get(job.id) || firstSeen.get(postingKey(job)) || now;
  }

  const current = deduped.filter((j) => isCurrent(j.expiryDate)).sort(byExpiry);
  const expired = deduped
    .filter((j) => !isCurrent(j.expiryDate))
    .sort((a, b) => (b.expiryDate ?? "").localeCompare(a.expiryDate ?? "")) // most-recently closed first
    .slice(0, MAX_ARCHIVE);

  const stats = buildStats(current);
  await env.JOBS_CACHE.put(JOBS_KEY, JSON.stringify(current));
  await env.JOBS_CACHE.put(EXPIRED_KEY, JSON.stringify(expired));
  await env.JOBS_CACHE.put(STATS_KEY, JSON.stringify(stats));

  // Jobs nobody has seen before → queue job alerts (skipped on the very first
  // scrape, when everything would count as "new").
  const fresh = existingCurrent.length ? current.filter((j) => !known.has(postingKey(j))) : [];
  if (fresh.length) {
    const queue: AlertQueue = {
      at: new Date().toISOString(),
      jobs: fresh.slice(0, 80).map((j) => ({ id: j.id, title: j.title, company: j.company, sector: j.sector })),
      done: [],
    };
    await env.JOBS_CACHE.put(ALERTS_KEY, JSON.stringify(queue), { expirationTtl: 60 * 60 * 24 });
  }
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
    const key = postingKey(j);
    const prev = seen.get(key);
    if (!prev || richness(j) > richness(prev)) seen.set(key, j);
  }
  return Array.from(seen.values());
}

/** Same posting on two job boards → same key (title + company, normalised). */
function postingKey(j: { title: string; company: string }): string {
  return `${j.title} ${j.company}`.toLowerCase().replace(/[^a-z0-9]/g, "");
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

// ─────────────────────────────────────────────────────────────────────────────
// Notifications, unread tracking and job alerts
// ─────────────────────────────────────────────────────────────────────────────

const MAX_OTHER_ROLES = 5;

/**
 * Push a notification to a user's devices, honouring their settings: a type
 * that's switched off is skipped; with sound off or during quiet hours it
 * arrives silently. Never throws — a failed push must not break the request.
 */
async function notify(
  env: Env,
  userId: string,
  type: NotifyType,
  n: { title: string; body: string; url: string; tag?: string },
): Promise<void> {
  try {
    if ((await getSubs(env, userId)).length === 0) return;
    const prefs = await getPrefs(env, userId);
    if (!notifyEnabled(prefs.notify, type)) return;
    await sendPush(
      env,
      userId,
      {
        type,
        ...n,
        silent: prefs.notify?.sound === false || inQuietHours(prefs.notify),
        badge: await unreadTotal(env, userId),
      },
      { urgency: type === "message" ? "high" : "normal" },
    );
  } catch (err) {
    console.error("notify failed", type, err);
  }
}

/** Merge a settings patch into the stored notification switches. */
function mergeNotify(cur: NotifyPrefs | undefined, patch: NotifyPrefs | undefined): NotifyPrefs | undefined {
  if (!patch || typeof patch !== "object") return cur;
  const next: NotifyPrefs = { ...(cur ?? {}) };
  for (const k of ["message", "interest", "jobs", "autoApply", "credits", "sound"] as const) {
    if (typeof patch[k] === "boolean") next[k] = patch[k];
  }
  for (const k of ["quietStart", "quietEnd"] as const) {
    if (patch[k] === null) next[k] = null;
    else if (isTime(patch[k])) next[k] = patch[k];
  }
  return next;
}

// Unread messages per thread, per user — one small KV record so the nav badge
// costs a single read.
const unreadKey = (userId: string) => `unread:${userId}`;

async function getUnread(env: Env, userId: string): Promise<Record<string, number>> {
  return (await env.JOBS_CACHE.get<Record<string, number>>(unreadKey(userId), "json")) ?? {};
}

async function unreadTotal(env: Env, userId: string): Promise<number> {
  return Object.values(await getUnread(env, userId)).reduce((n, v) => n + v, 0);
}

/** After a message is saved: count it as unread for the other side and notify them. */
async function afterMessage(env: Env, thread: Thread, from: Message["from"]): Promise<void> {
  const recipient = from === "employer" ? thread.candidateEmail : thread.employerUserId;
  const sender = from === "employer" ? thread.employerCompany : thread.candidateName;
  const unread = await getUnread(env, recipient);
  unread[thread.id] = (unread[thread.id] ?? 0) + 1;
  await env.JOBS_CACHE.put(unreadKey(recipient), JSON.stringify(unread));

  const text = thread.messages[thread.messages.length - 1]?.text ?? "";
  await notify(env, recipient, "message", {
    title: sender || "New message",
    body: text.length > 110 ? `${text.slice(0, 110)}…` : text,
    url: `/messages?t=${encodeURIComponent(thread.id)}`,
    tag: `thread-${thread.id}`,
  });
}

// Read markers live outside the thread record so "mark as read" can never
// overwrite a message that arrives at the same moment.
const threadReadKey = (id: string) => `threadread:${id}`;

/**
 * Record that `role` has read the thread up to now (only writes when there is
 * something new from the other side) and return both sides' read times.
 */
async function markThreadRead(
  env: Env,
  thread: Thread,
  role: Message["from"],
  userId: string,
): Promise<NonNullable<Thread["readAt"]>> {
  const readAt = (await env.JOBS_CACHE.get<NonNullable<Thread["readAt"]>>(threadReadKey(thread.id), "json")) ?? {};
  const lastFromOther = [...thread.messages].reverse().find((m) => m.from !== role);
  const mine = readAt[role];
  if (lastFromOther && (!mine || mine < lastFromOther.at)) {
    readAt[role] = new Date().toISOString();
    await env.JOBS_CACHE.put(threadReadKey(thread.id), JSON.stringify(readAt));
  }
  const unread = await getUnread(env, userId);
  if (unread[thread.id]) {
    delete unread[thread.id];
    await env.JOBS_CACHE.put(unreadKey(userId), JSON.stringify(unread));
  }
  return readAt;
}

// Job alerts: after a scrape finds brand-new jobs, each subscribed user hears
// about the ones that fit them — main profession first.
const ALERTS_KEY = "alerts:queue";
const ALERTS_PER_RUN = 40; // users per cron run (bounds subrequests); the rest continue next run

type AlertQueue = { at: string; jobs: SlimJob[]; done: string[] };

/** Work through the alert queue: up to ALERTS_PER_RUN subscribed users per call. */
async function processJobAlerts(env: Env): Promise<void> {
  const queue = await env.JOBS_CACHE.get<AlertQueue>(ALERTS_KEY, "json");
  if (!queue || !queue.jobs.length) return;
  const done = new Set(queue.done);
  const { keys } = await env.JOBS_CACHE.list({ prefix: PUSH_SUBS_PREFIX, limit: 1000 });
  const pending = keys.map((k) => k.name.slice(PUSH_SUBS_PREFIX.length)).filter((u) => !done.has(u));

  for (const userId of pending.slice(0, ALERTS_PER_RUN)) {
    done.add(userId);
    try {
      const [prefs, profile] = await Promise.all([getPrefs(env, userId), getProfile(env, userId)]);
      if (!notifyEnabled(prefs.notify, "jobs")) continue;
      const applied = new Set(await getApplied(env, userId));
      const { main, other } = jobsForUser(queue.jobs.filter((j) => !applied.has(j.id)), profile, prefs);
      const text = jobAlertText(main, other, profile.mainProfession);
      if (text) await notify(env, userId, "jobs", { ...text, tag: "jobs" });
    } catch (err) {
      console.error("job alert failed for", userId, err);
    }
  }

  if (pending.length <= ALERTS_PER_RUN) await env.JOBS_CACHE.delete(ALERTS_KEY);
  else await env.JOBS_CACHE.put(ALERTS_KEY, JSON.stringify({ ...queue, done: [...done] }), { expirationTtl: 60 * 60 * 24 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin helpers: prices, prompts, user list
// ─────────────────────────────────────────────────────────────────────────────

/** Keep prices whole numbers between 0 and 10,000 credits. */
function cleanCosts(patch: Partial<AppConfig["costs"]>, current: AppConfig["costs"]): AppConfig["costs"] {
  const next = { ...current };
  for (const k of Object.keys(current) as (keyof AppConfig["costs"])[]) {
    const v = Number(patch[k]);
    if (patch[k] !== undefined && Number.isFinite(v)) next[k] = Math.min(10_000, Math.max(0, Math.round(v)));
  }
  return next;
}

/** An empty prompt means "use the default". */
function cleanPrompts(patch: AppConfig["prompts"], current: AppConfig["prompts"]): AppConfig["prompts"] {
  const next = { ...current };
  for (const k of Object.keys(DEFAULT_PROMPTS) as PromptKey[]) {
    if (!(k in patch)) continue;
    const v = String(patch[k] ?? "").trim().slice(0, 4000);
    if (v && v !== DEFAULT_PROMPTS[k]) next[k] = v;
    else delete next[k];
  }
  return next;
}

/** All keys under a prefix (KV lists 1000 at a time). */
async function listKeyNames(env: Env, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.JOBS_CACHE.list({ prefix, cursor });
    names.push(...page.keys.map((k) => k.name.slice(prefix.length)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

export type AdminUserRow = {
  email: string;
  name: string | null;
  credits: number;
  cvs: number;
  applications: number;
  employer: Employer["status"] | null;
  availability: Profile["availability"] | null;
  mainProfession: string | null;
  autoApply: boolean;
  notificationDevices: number;
};

const USERS_PAGE = 50;

/**
 * Everyone who has signed in and done something (credits, profile, CVs,
 * preferences or an employer account all leave a record). Totals cover all
 * users; per-user details are loaded one page at a time to stay within the
 * Worker's storage-read budget.
 */
async function listUsers(env: Env, offset: number, q: string) {
  const [credits, profiles, cvs, prefs, employers, gtokens, pushsubs] = await Promise.all(
    ["credits:", "profile:", "cvs:", "prefs:", "employer:", "gtoken:", PUSH_SUBS_PREFIX].map((p) => listKeyNames(env, p)),
  );
  const all = [...new Set([...credits, ...profiles, ...cvs, ...prefs, ...employers])]
    .filter((e) => e.includes("@"))
    .sort((a, b) => a.localeCompare(b));
  const matching = q ? all.filter((e) => e.toLowerCase().includes(q)) : all;
  const pageEmails = matching.slice(offset, offset + USERS_PAGE);
  const autoOn = new Set(gtokens);
  const devicesOn = new Set(pushsubs);

  const users: AdminUserRow[] = await Promise.all(
    pageEmails.map(async (email) => {
      const [balance, profile, cvList, applied, employer, subs] = await Promise.all([
        env.JOBS_CACHE.get(`credits:${email}`),
        env.JOBS_CACHE.get<Profile>(`profile:${email}`, "json"),
        env.JOBS_CACHE.get<StoredCV[]>(`cvs:${email}`, "json"),
        env.JOBS_CACHE.get<string[]>(`applied:${email}`, "json"),
        env.JOBS_CACHE.get<Employer>(`employer:${email}`, "json"),
        devicesOn.has(email) ? getSubs(env, email) : Promise.resolve([]),
      ]);
      return {
        email,
        name: profile?.name ?? null,
        credits: balance === null ? 0 : Number(balance) || 0,
        cvs: cvList?.length ?? 0,
        applications: applied?.length ?? 0,
        employer: employer?.status ?? null,
        availability: profile?.availability ?? null,
        mainProfession: profile?.mainProfession ?? null,
        autoApply: autoOn.has(email),
        notificationDevices: subs.length,
      };
    }),
  );

  return {
    users,
    total: matching.length,
    offset,
    pageSize: USERS_PAGE,
    totals: {
      users: all.length,
      withCv: new Set(cvs).size,
      employers: employers.length,
      autoApplyOn: gtokens.length,
      notificationsOn: pushsubs.length,
    },
  };
}
