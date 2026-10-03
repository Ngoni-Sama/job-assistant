"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  ArrowRight,
  Bell,
  Briefcase,
  CheckCircle2,
  Circle,
  Clock,
  Coins,
  FileText,
  LogIn,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing, JobScore, Prefs, Profile, StoredCV } from "@/lib/types";
import { JobTile } from "@/components/JobTile";
import { ApplyModal } from "@/components/ApplyModal";
import { useLive } from "@/components/LiveUpdates";
import { useCosts } from "@/lib/useCosts";
import { hasTargets, matchScore, profileTargets } from "@/lib/jobMatch";
import { enablePush, getPushState, type PushState } from "@/lib/push";

type Step = { id: string; done: boolean; title: string; body: string; href?: string; cta: string; onClick?: () => void; optional?: boolean };

/** Job seeker's home: what to do next, how it's going, and the jobs that fit them. */
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const authed = status === "authenticated";
  const costs = useCosts();
  const { unread } = useLive();

  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [cvs, setCvs] = useState<StoredCV[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [push, setPush] = useState<PushState>("unsupported");
  const [verified, setVerified] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [scores, setScores] = useState<Record<string, JobScore>>({});
  const [matching, setMatching] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [optimisingId, setOptimisingId] = useState<string | null>(null);
  const [activeCvId, setActiveCvId] = useState<string | undefined>();
  const [active, setActive] = useState<Application | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    (async () => {
      setLoading(true);
      try {
        const jobsRes = await api.getJobs();
        setJobs(jobsRes.jobs);
        if (authed) {
          const [cvsRes, profileRes, prefsRes, appsRes, appliedRes, creditsRes, me, checks, pushState] = await Promise.all([
            api.getCvs(),
            api.getProfile().catch(() => null),
            api.getPrefs().catch(() => null),
            api.getApplications().catch(() => ({ applications: [] as Application[] })),
            api.getApplied().catch(() => ({ applied: [] as string[] })),
            api.getCredits().catch(() => null),
            api.getMe().catch(() => null),
            api.getChecks().catch(() => null),
            getPushState().catch(() => "unsupported" as PushState),
          ]);
          setCvs(cvsRes.cvs);
          setProfile(profileRes?.profile ?? null);
          setPrefs(prefsRes?.prefs ?? null);
          setApplications(appsRes.applications);
          setApplied(new Set(appliedRes.applied));
          setCredits(creditsRes?.balance ?? null);
          setIsAdmin(!!me?.isAdmin);
          setVerified(checks?.mine.filter((m) => m.status === "cleared").length ?? 0);
          setPush(pushState);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [status, authed]);

  const targets = useMemo(() => profileTargets(profile, prefs), [profile, prefs]);
  const knowsMe = hasTargets(targets);
  const today = new Date().toISOString().slice(0, 10);
  const inAWeek = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  // Jobs that fit the profile (main profession first); newest jobs when we don't know them yet.
  const forYou = useMemo(() => {
    const open = jobs.filter((j) => !j.expiryDate || j.expiryDate >= today);
    const ranked = knowsMe
      ? open
          .map((j) => ({ j, s: matchScore(j, targets) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.j)
      : open;
    return [...ranked].sort((a, b) => (scores[b.id]?.score ?? -1) - (scores[a.id]?.score ?? -1));
  }, [jobs, knowsMe, targets, today, scores]);
  const closingSoon = useMemo(
    () => forYou.filter((j) => j.expiryDate && j.expiryDate <= inAWeek && !applied.has(j.id)).slice(0, 4),
    [forYou, inAWeek, applied],
  );

  const sent = applications.filter((a) => a.sent).length;
  const firstName = (profile?.name || session?.user?.name || "").split(" ")[0];

  const steps: Step[] = [
    {
      id: "cv",
      done: cvs.length > 0,
      title: "Add your CV",
      body: "Build an ATS-friendly CV (with a free score), or upload the one you have.",
      href: "/cv-builder",
      cta: "Build my CV",
    },
    {
      id: "profession",
      done: !!profile?.mainProfession,
      title: "Tell us your profession",
      body: "So we can show you the right jobs and alert you when they’re posted.",
      href: "/settings",
      cta: "Set it",
    },
    {
      id: "alerts",
      done: push === "on" || push === "unsupported",
      title: "Turn on job alerts",
      body: push === "denied" ? "Notifications are blocked — allow them in your browser settings." : "Get a notification when a job in your field is posted or an employer messages you.",
      cta: "Turn on",
      onClick: async () => setPush(await enablePush()),
    },
    {
      id: "visible",
      done: profile?.availability === "looking" || profile?.availability === "open",
      title: "Let employers find you",
      body: "Show you’re available so verified employers can contact you.",
      href: "/profile",
      cta: "Update profile",
    },
    {
      id: "verified",
      done: verified > 0,
      title: "Get a verified badge",
      body: "Optional: ID or qualification checks make employers trust your profile.",
      href: "/verification",
      cta: "See checks",
      optional: true,
    },
  ];
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  const todo = steps.filter((s) => !s.done);

  async function apply(job: JobListing, cvId?: string) {
    if (!authed) return signIn("google");
    if (!cvs.length) {
      setError("Add your CV first — build one in the CV Creator or upload yours.");
      return;
    }
    setPreparingId(job.id);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application, autoSent } = await api.prepareApplication(job.id, cvId);
      if (autoSent) {
        setApplied((prev) => new Set(prev).add(job.id));
        setToast(autoSent.sent ? `Auto-applied to ${job.title} ✅` : `Prepared ${job.title}.`);
      } else setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingId(null);
    }
  }

  async function optimise(job: JobListing, cvId?: string) {
    if (!authed) return signIn("google");
    if (!cvs.length) {
      setError("Add your CV first — build one in the CV Creator or upload yours.");
      return;
    }
    setOptimisingId(job.id);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application } = await api.optimiseApplication(job.id, cvId);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimisingId(null);
    }
  }

  async function runMatch() {
    setMatching(true);
    setError("");
    try {
      const { scores } = await api.matchAll();
      setScores(Object.fromEntries(scores.map((s) => [s.jobId, s])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatching(false);
    }
  }

  async function adminRefresh() {
    setLoading(true);
    try {
      const res = await api.scrape();
      setJobs(res.jobs);
      setToast(`Refreshed — ${res.jobs.length} open jobs.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") return <p className="py-16 text-center text-gray-500">Loading your dashboard…</p>;

  if (!authed) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="glass-strong space-y-4 rounded-3xl p-8 text-center">
          <UserRound className="mx-auto h-10 w-10 text-brand-600" />
          <h1 className="text-2xl font-extrabold tracking-tight">Your job-search dashboard</h1>
          <p className="text-gray-600">
            Sign in to see jobs that fit your profession, track your applications and get alerts when new jobs are posted.
          </p>
          <button
            onClick={() => signIn("google")}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-6 py-3 font-medium text-white shadow-lg"
          >
            <LogIn className="h-4 w-4" /> Sign in with Google
          </button>
          <p className="text-sm text-gray-500">
            Or{" "}
            <Link href="/jobs" className="text-brand-700 underline">
              browse all jobs
            </Link>{" "}
            without an account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{firstName ? `Hi ${firstName} 👋` : "Your dashboard"}</h1>
          <p className="text-sm text-gray-600">
            {knowsMe && profile?.mainProfession
              ? `${forYou.length} open ${forYou.length === 1 ? "job matches" : "jobs match"} ${profile.mainProfession}.`
              : `${jobs.length} open jobs in Zimbabwe right now.`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={adminRefresh} className="glass flex items-center gap-1.5 rounded-full px-4 py-2 text-sm text-gray-700" title="Admin: re-scrape the job boards">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh jobs (admin)
          </button>
        )}
      </div>

      {error && <div className="rounded-2xl bg-red-50/90 p-3 text-sm text-red-700">{error}</div>}
      {toast && <div className="rounded-2xl bg-green-50/90 p-3 text-sm text-green-700">{toast}</div>}

      {/* Getting set up */}
      {!loading && todo.length > 0 && (
        <section className="glass-strong rounded-3xl p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Get set up to get hired</h2>
            <span className="text-sm text-gray-500">
              {doneCount} of {required.length} done
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all" style={{ width: `${(doneCount / required.length) * 100}%` }} />
          </div>
          <ul className="mt-4 divide-y divide-gray-100">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-3">
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${s.done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {s.title}
                    {s.optional && <span className="ml-2 text-xs font-normal text-gray-400">optional</span>}
                  </p>
                  {!s.done && <p className="text-sm text-gray-600">{s.body}</p>}
                </div>
                {!s.done &&
                  (s.onClick ? (
                    push !== "denied" && (
                      <button onClick={s.onClick} className="shrink-0 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white">
                        {s.cta}
                      </button>
                    )
                  ) : (
                    <Link href={s.href!} className="shrink-0 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white">
                      {s.cta}
                    </Link>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How it's going */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Your activity">
        <Stat href="/applications" icon={Send} label="Applications sent" value={sent} />
        <Stat href="/jobs" icon={Briefcase} label="Jobs for you" value={forYou.length} />
        <Stat
          href={cvs.length ? "/cv-builder" : "/upload"}
          icon={FileText}
          label={cvs.length === 1 ? "CV ready" : "CVs ready"}
          value={cvs.length}
        />
        {unread > 0 ? (
          <Stat href="/messages" icon={MessageSquare} label="Unread messages" value={unread} highlight />
        ) : (
          <Stat href="/billing" icon={Coins} label="Credits" value={credits ?? "—"} />
        )}
      </section>

      {/* Closing soon */}
      {closingSoon.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Clock className="h-5 w-5 text-accent-600" /> Closing this week{knowsMe ? " — in your field" : ""}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {closingSoon.map((job) => (
              <JobTile
                key={job.id}
                job={job}
                score={scores[job.id]}
                applied={applied.has(job.id)}
                preparing={preparingId === job.id}
                optimising={optimisingId === job.id}
                cvs={cvs}
                onApply={apply}
                onOptimise={optimise}
              />
            ))}
          </div>
        </section>
      )}

      {/* Jobs for you */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-brand-600" /> {knowsMe ? "Jobs for you" : "Latest jobs"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {cvs.length > 0 && forYou.length > 0 && (
              <button
                onClick={runMatch}
                disabled={matching}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-brand-700 disabled:opacity-50"
                title="AI scores each job against your CV"
              >
                <Sparkles className={`h-4 w-4 ${matching ? "animate-pulse" : ""}`} />
                {matching ? "Scoring…" : "Score against my CV"}
                <span className="flex items-center gap-0.5 text-xs text-accent-700">
                  <Coins className="h-3 w-3" /> {costs.matchAll}
                </span>
              </button>
            )}
            <Link href="/smart-match" className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">
              <Zap className="h-4 w-4" /> Swipe through them
            </Link>
          </div>
        </div>
        {!knowsMe && !loading && (
          <p className="text-sm text-gray-600">
            <Link href="/settings" className="text-brand-700 underline">
              Add your profession
            </Link>{" "}
            and we’ll only show jobs that fit you.
          </p>
        )}
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : forYou.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-gray-600">
            No open jobs match {profile?.mainProfession || "your profile"} right now — we’ll alert you when one is posted.{" "}
            <Link href="/jobs" className="text-brand-700 underline">
              See all jobs
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {forYou.slice(0, 9).map((job) => (
                <JobTile
                  key={job.id}
                  job={job}
                  score={scores[job.id]}
                  applied={applied.has(job.id)}
                  preparing={preparingId === job.id}
                  optimising={optimisingId === job.id}
                  cvs={cvs}
                  onApply={apply}
                  onOptimise={optimise}
                />
              ))}
            </div>
            <div className="text-center">
              <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                See all {jobs.length} jobs <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Quiet reminders for things that matter later */}
      {!loading && (push === "on" || verified > 0) && (
        <p className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          {push === "on" && (
            <span className="flex items-center gap-1">
              <Bell className="h-3.5 w-3.5" /> Job alerts on
            </span>
          )}
          {verified > 0 && (
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> {verified} verification{verified === 1 ? "" : "s"} cleared
            </span>
          )}
        </p>
      )}

      {active && (
        <ApplyModal
          application={active}
          cvId={activeCvId}
          onClose={() => setActive(null)}
          onSent={(jobId) => setApplied((prev) => new Set(prev).add(jobId))}
        />
      )}
    </div>
  );
}

function Stat({
  href,
  icon: Icon,
  label,
  value,
  highlight,
}: {
  href: string;
  icon: typeof Send;
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`glass flex items-center gap-3 rounded-2xl p-4 transition-transform hover:-translate-y-0.5 ${highlight ? "ring-2 ring-accent-400" : ""}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${highlight ? "bg-accent-100 text-accent-700" : "bg-brand-50 text-brand-700"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-extrabold leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{label}</p>
      </div>
    </Link>
  );
}
