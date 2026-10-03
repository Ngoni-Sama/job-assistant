"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { Zap, Heart, Lock, UserRound, LayoutGrid, Globe2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing, Prefs, Profile, StoredCV } from "@/lib/types";
import { SECTORS } from "@/lib/sectors";
import { hasTargets, matchScore, profileTargets } from "@/lib/jobMatch";
import { SwipeDeck } from "@/components/SwipeDeck";
import { ApplyModal } from "@/components/ApplyModal";
import { RadialApply } from "@/components/RadialApply";

import { useCosts } from "@/lib/useCosts";
const LIKED_KEY = "smartmatch:liked";
const PREFS_KEY = "smartmatch:prefs"; // captured guest swipes {jobId, liked}
const GUEST_LIMIT = 3; // free swipes before sign-in is required
const VIEW_KEY = "smartmatch:view"; // remembered filter: { mode, sectors }

/** For me = matches my profile · Categories = sectors I pick · All = everything. */
type Mode = "forMe" | "categories" | "all";

export default function SmartMatchPage() {
  const costs = useCosts();
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
  const [mode, setMode] = useState<Mode | null>(null); // null until we know what to default to
  const [sectors, setSectors] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  // Jobs already swiped (either way) — left out of the deck so a new filter doesn't repeat them.
  const swipedRef = useRef<Set<string>>(new Set());
  const [deckVersion, setDeckVersion] = useState(0);

  // Gate guests after GUEST_LIMIT swipes — their picks are still captured.
  const locked = !authed && guestSwipes >= GUEST_LIMIT;

  useEffect(() => {
    api
      .getJobs()
      .then((r) => setJobs(r.jobs))
      .finally(() => setLoading(false));
    try {
      setLiked(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]"));
      const decided = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "[]") as { jobId: string }[];
      swipedRef.current = new Set(decided.map((d) => d.jobId));
      const view = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as { mode?: Mode; sectors?: string[] } | null;
      if (view?.sectors) setSectors(view.sectors);
      if (view?.mode) setMode(view.mode);
    } catch {
      /* ignore */
    }
  }, []);

  // Remember the chosen view on this device.
  useEffect(() => {
    if (!mode) return;
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ mode, sectors }));
    } catch {
      /* ignore */
    }
  }, [mode, sectors]);

  // Seed the filters from the user's profile + saved categories once signed in.
  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setMode((m) => (m === "forMe" || !m ? "all" : m)); // "For me" needs a profile
      return;
    }
    Promise.all([api.getPrefs(), api.getProfile()])
      .then(([pr, pf]) => {
        setPrefs(pr.prefs);
        setSelectedCats(pr.prefs.categories ?? []);
        setProfile(pf.profile);
        // First visit: show "For me" when the profile says what they do.
        setMode((m) => m ?? (hasTargets(profileTargets(pf.profile, pr.prefs)) ? "forMe" : "all"));
      })
      .catch(() => setMode((m) => m ?? "all"));
  }, [authed, status]);

  const targets = useMemo(() => profileTargets(profile, prefs), [profile, prefs]);
  const canMatch = authed && hasTargets(targets);

  // Job types present in the current jobs, for the filter chips.
  const jobTypes = useMemo(
    () => [...new Set(jobs.map((j) => j.jobType).filter(Boolean))] as string[],
    [jobs],
  );

  // Jobs per sector (for the category chips), and how many fit the profile.
  const sectorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) if (j.sector) counts.set(j.sector, (counts.get(j.sector) ?? 0) + 1);
    return counts;
  }, [jobs]);
  const forMeCount = useMemo(
    () => (canMatch ? jobs.filter((j) => matchScore(j, targets) > 0).length : 0),
    [jobs, targets, canMatch],
  );

  // The deck: chosen view + job type, minus jobs already swiped. Main-profession
  // matches come first in "For me". Rebuilt only when the filter changes, so
  // swiping doesn't reshuffle the cards under the user's thumb.
  const deckJobs = useMemo(() => {
    let list = jobs;
    if (mode === "forMe" && canMatch) {
      list = jobs
        .map((j) => ({ j, score: matchScore(j, targets) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.j);
    } else if (mode === "categories" && sectors.length) {
      list = jobs.filter((j) => j.sector && sectors.includes(j.sector));
    }
    if (selectedCats.length) list = list.filter((j) => j.jobType && selectedCats.includes(j.jobType));
    return list.filter((j) => !swipedRef.current.has(j.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, mode, sectors, selectedCats, targets, canMatch, deckVersion]);
  const deckKey = `${mode}|${sectors.join(",")}|${selectedCats.join(",")}|${deckVersion}`;

  function toggleSector(sector: string) {
    setSectors((prev) => (prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]));
  }

  /** Bring back jobs already swiped (the shortlist is kept). */
  function startOver() {
    swipedRef.current = new Set();
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      /* ignore */
    }
    setDeckVersion((v) => v + 1);
  }

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
    swipedRef.current.add(job.id);
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

      {/* What to swipe through */}
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="mx-auto flex w-fit flex-wrap justify-center gap-1 rounded-full bg-white/60 p-1 shadow-sm">
          {(
            [
              { id: "forMe", label: "For me", icon: UserRound, count: canMatch ? forMeCount : null },
              { id: "categories", label: "Categories", icon: LayoutGrid, count: null },
              { id: "all", label: "All jobs", icon: Globe2, count: jobs.length },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => (m.id === "forMe" && !authed ? signIn("google") : setMode(m.id))}
              aria-pressed={mode === m.id}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mode === m.id ? "bg-brand-600 text-white shadow-sm" : "text-gray-600 hover:bg-white"
              }`}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
              {m.count !== null && <span className="text-xs opacity-75">{m.count}</span>}
            </button>
          ))}
        </div>

        {mode === "forMe" && (
          <p className="text-center text-xs text-gray-500">
            {canMatch ? (
              <>
                Matching{" "}
                <b className="text-gray-700">
                  {[targets.mainProfession, ...targets.roles, ...targets.sectors].filter(Boolean).join(", ") ||
                    targets.keywords.join(", ")}
                </b>
                {targets.mainProfession && " — your main profession first"}.{" "}
                <Link href="/settings" className="text-brand-700 underline">
                  Edit
                </Link>
              </>
            ) : (
              <>
                Tell us your main profession and sector in{" "}
                <Link href="/settings" className="text-brand-700 underline">
                  Settings
                </Link>{" "}
                to see jobs that fit you.
              </>
            )}
          </p>
        )}

        {mode === "categories" && (
          <div className="flex flex-wrap justify-center gap-2">
            {SECTORS.filter((sec) => sectorCounts.has(sec)).map((sec) => (
              <button
                key={sec}
                onClick={() => toggleSector(sec)}
                aria-pressed={sectors.includes(sec)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  sectors.includes(sec) ? "bg-violet-600 text-white" : "bg-white/70 text-gray-600 hover:bg-white"
                }`}
              >
                {sec} <span className="opacity-70">{sectorCounts.get(sec)}</span>
              </button>
            ))}
          </div>
        )}

        {jobTypes.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Type</span>
            <button
              onClick={() => setSelectedCats([])}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCats.length === 0 ? "bg-brand-600 text-white" : "bg-white/70 text-gray-600 hover:bg-white"
              }`}
            >
              Any
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
      </div>

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
            <div className="glass mx-auto max-w-md space-y-3 rounded-3xl p-8 text-center">
              <p className="text-gray-600">
                {mode === "categories" && !sectors.length
                  ? "Pick one or more categories above."
                  : mode === "forMe" && !canMatch
                    ? "Add your main profession in Settings to see jobs that fit you."
                    : "No new jobs here right now — you’ve swiped through them all, or try another filter."}
              </p>
              {swipedRef.current.size > 0 && (
                <button
                  onClick={startOver}
                  className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm text-gray-700 hover:bg-white"
                >
                  <RotateCcw className="h-4 w-4" /> Show jobs I already swiped
                </button>
              )}
            </div>
          ) : (
            <SwipeDeck key={deckKey} jobs={deckJobs} onDecision={onDecision} locked={locked} />
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
                    cost={costs.optimise}
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
