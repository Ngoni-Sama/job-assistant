"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MapPin, Briefcase, GraduationCap, Heart, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { CandidateCard } from "@/lib/types";
import { SwipeStack } from "@/components/SwipeStack";

export default function EmployerSwipePage() {
  const { status } = useSession();
  const [candidates, setCandidates] = useState<CandidateCard[]>([]);
  const [shortlisted, setShortlisted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "unauthenticated") {
        setError("Sign in with an approved employer account.");
        setLoading(false);
      }
      return;
    }
    api
      .getCandidates()
      .then((r) => setCandidates(Object.values(r.sectors).flat()))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [status]);

  function onDecision(c: CandidateCard, liked: boolean) {
    if (!liked) return;
    setShortlisted((n) => n + 1);
    api.shortlistCandidate(c).catch(() => {});
  }

  const shuffled = useMemo(() => candidates, [candidates]);

  if (loading) return <p className="text-gray-500">Loading candidates…</p>;
  if (error) {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-2 text-gray-600">{error}</p>
        <a href="/employers" className="mt-3 inline-block text-sm text-brand-700 underline">
          Employer registration →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Find your next hire</h1>
        <p className="mt-1 text-gray-600">
          Swipe right to shortlist, left to pass.{" "}
          <Link href="/employers/candidates" className="text-brand-700 underline">
            View shortlist
          </Link>
        </p>
        {shortlisted > 0 && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-green-600">
            <Heart className="h-4 w-4" /> {shortlisted} shortlisted this session
          </p>
        )}
      </div>

      <SwipeStack
        items={shuffled}
        getKey={(c) => c.id}
        onDecision={onDecision}
        rightLabel="SHORTLIST"
        leftLabel="PASS"
        emptyState={
          <div className="glass rounded-3xl p-10 text-center">
            <Heart className="mx-auto h-10 w-10 text-brand-600" />
            <h3 className="mt-3 text-xl font-bold">You’ve seen everyone!</h3>
            <p className="mt-1 text-gray-600">
              Review your{" "}
              <Link href="/employers/candidates" className="text-brand-700 underline">
                shortlist
              </Link>
              .
            </p>
          </div>
        }
        renderCard={(c) => <SwipeCard c={c} />}
      />
    </div>
  );
}

function SwipeCard({ c }: { c: CandidateCard }) {
  return (
    <div className="glass-strong flex h-[440px] flex-col rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-violet-600 text-xl font-bold text-white">
          {c.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-xl font-extrabold">{c.name}</h3>
          <span className="rounded-full bg-violet-100/70 px-2 py-0.5 text-xs font-medium text-violet-700">
            {c.sector}
          </span>
        </div>
      </div>
      {c.headline && <p className="mt-4 text-gray-700">{c.headline}</p>}
      <div className="mt-4 space-y-1.5 text-sm text-gray-500">
        {c.location && (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {c.location}
          </p>
        )}
        {c.yearsExperience != null && (
          <p className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" /> {c.yearsExperience} years experience
          </p>
        )}
        {c.education && (
          <p className="flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4" /> {c.education}
          </p>
        )}
      </div>
      {c.skills && c.skills.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {c.skills.slice(0, 8).map((s) => (
            <span key={s} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
