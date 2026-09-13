"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Zap, Heart, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing, StoredCV } from "@/lib/types";
import { SwipeDeck } from "@/components/SwipeDeck";
import { ApplyModal } from "@/components/ApplyModal";
import { RadialApply } from "@/components/RadialApply";

const LIKED_KEY = "smartmatch:liked";
const PREFS_KEY = "smartmatch:prefs"; // captured guest swipes {jobId, liked}
const GUEST_LIMIT = 3; // free swipes before sign-in is required

export default function SmartMatchPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [liked, setLiked] = useState<JobListing[]>([]);
  const [guestSwipes, setGuestSwipes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Application | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [optimisingId, setOptimisingId] = useState<string | null>(null);
  const [cvs, setCvs] = useState<StoredCV[]>([]);
  const [activeCvId, setActiveCvId] = useState<string | undefined>();
  const [error, setError] = useState("");
  // Category (job-type) filter — mirrors the dashboard's "My categories".
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  // Gate guests after GUEST_LIMIT swipes — their picks are still captured.
  const locked = !authed && guestSwipes >= GUEST_LIMIT;

  useEffect(() => {
    api
      .getJobs()
      .then((r) => setJobs(r.jobs))
      .finally(() => setLoading(false));
    try {
      setLiked(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  // Seed the filter from the user's saved categories once signed in.
  useEffect(() => {
    if (authed) api.getPrefs().then((r) => setSelectedCats(r.prefs.categories ?? [])).catch(() => {});
  }, [authed]);

  // Job types present in the current jobs, for the filter chips.
  const jobTypes = useMemo(
    () => [...new Set(jobs.map((j) => j.jobType).filter(Boolean))] as string[],
    [jobs],
  );

  // Only swipe through jobs in the selected categories (all when none picked).
  const deckJobs = useMemo(
    () => (selectedCats.length ? jobs.filter((j) => j.jobType && selectedCats.includes(j.jobType)) : jobs),
    [jobs, selectedCats],
  );

  function toggleCat(cat: string) {
    setSelectedCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function onDecision(job: JobListing, isLiked: boolean) {
    // Always capture the preference (liked or skipped) so it survives sign-in.
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "[]");
      prefs.push({ jobId: job.id, liked: isLiked, at: Date.now() });
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    if (!authed) setGuestSwipes((n) => n + 1);
    if (!isLiked) return;
    setLiked((prev) => {
      const next = prev.some((j) => j.id === job.id) ? prev : [...prev, job];
      localStorage.setItem(LIKED_KEY, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    if (authed) api.getCvs().then((r) => setCvs(r.cvs)).catch(() => {});
  }, [authed]);

  async function apply(job: JobListing, cvId?: string) {
    if (status !== "authenticated") return signIn("google");
    setPreparingId(job.id);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application } = await api.prepareApplication(job.id, cvId);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingId(null);
    }
  }

  async function optimise(job: JobListing, cvId?: string) {
    if (status !== "authenticated") return signIn("google");
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

  return (
    <div className="space-y-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
          <Zap className="h-3.5 w-3.5" /> Swipe 2 Match
        </span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Swipe your way to your next job</h1>
        <p className="mt-1 text-gray-600">Right to apply, left to skip. It’s that simple.</p>
      </div>

      {jobTypes.length > 0 && (
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setSelectedCats([])}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCats.length === 0 ? "bg-brand-600 text-white" : "bg-white/70 text-gray-600 hover:bg-white"
            }`}
          >
            All
          </button>
          {jobTypes.map((t) => (
            <button
              key={t}
              onClick={() => toggleCat(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCats.includes(t) ? "bg-brand-600 text-white" : "bg-white/70 text-gray-600 hover:bg-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-sm rounded-2xl bg-red-50/80 p-3 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500">Loading jobs…</p>
      ) : (
        <div className="relative">
          {deckJobs.length === 0 ? (
            <p className="py-12 text-center text-gray-500">
              No jobs in the selected categories — pick “All” or different filters above.
            </p>
          ) : (
            <SwipeDeck jobs={deckJobs} onDecision={onDecision} locked={locked} />
          )}
          {locked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-white/70 backdrop-blur-sm">
              <div className="glass-strong mx-4 max-w-xs rounded-2xl p-6 text-center">
                <Lock className="mx-auto h-8 w-8 text-brand-600" />
                <h3 className="mt-2 font-bold">Sign in to keep swiping</h3>
                <p className="mt-1 text-sm text-gray-600">
                  We saved your {guestSwipes} picks — sign in and pick up right where you left off.
                </p>
                <button
                  onClick={() => signIn("google")}
                  className="mt-4 w-full rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Continue with Google
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {liked.length > 0 && (
        <section className="mx-auto max-w-2xl space-y-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Heart className="h-5 w-5 text-brand-600" /> Your shortlist ({liked.length})
          </h2>
          <div className="space-y-2">
            {liked.map((job) => (
              <div key={job.id} className="glass flex items-center justify-between gap-3 rounded-xl p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {job.company} · {job.location}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RadialApply
                    mode="apply"
                    cvs={cvs}
                    preparing={preparingId === job.id}
                    onApply={(cvId) => apply(job, cvId)}
                  />
                  <RadialApply
                    mode="optimise"
                    cost={3}
                    cvs={cvs}
                    preparing={optimisingId === job.id}
                    onApply={(cvId) => optimise(job, cvId)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active && (
        <ApplyModal application={active} cvId={activeCvId} onClose={() => setActive(null)} onSent={() => setActive(null)} />
      )}
    </div>
  );
}
