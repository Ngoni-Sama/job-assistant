"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Zap, Heart, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing } from "@/lib/types";
import { SwipeDeck } from "@/components/SwipeDeck";
import { ApplyModal } from "@/components/ApplyModal";

const LIKED_KEY = "smartmatch:liked";

export default function SmartMatchPage() {
  const { status } = useSession();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [liked, setLiked] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Application | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [error, setError] = useState("");

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

  function onDecision(job: JobListing, isLiked: boolean) {
    if (!isLiked) return;
    setLiked((prev) => {
      const next = prev.some((j) => j.id === job.id) ? prev : [...prev, job];
      localStorage.setItem(LIKED_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function optimise(job: JobListing) {
    if (status !== "authenticated") return signIn("google");
    setPreparingId(job.id);
    setError("");
    try {
      const { application } = await api.prepareApplication(job.id);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
          <Zap className="h-3.5 w-3.5" /> Smart Match
        </span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Swipe your way to your next job</h1>
        <p className="mt-1 text-gray-600">Right to apply, left to skip. It’s that simple.</p>
      </div>

      {error && (
        <div className="mx-auto max-w-sm rounded-2xl bg-red-50/80 p-3 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500">Loading jobs…</p>
      ) : (
        <SwipeDeck jobs={jobs} onDecision={onDecision} />
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
                <button
                  onClick={() => optimise(job)}
                  disabled={preparingId === job.id}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {preparingId === job.id ? "…" : "Optimise CV"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {active && (
        <ApplyModal application={active} onClose={() => setActive(null)} onSent={() => setActive(null)} />
      )}
    </div>
  );
}
