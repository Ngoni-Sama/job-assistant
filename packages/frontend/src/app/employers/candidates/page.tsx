"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Users,
  ChevronLeft,
  MapPin,
  Briefcase,
  GraduationCap,
  Languages,
  Lock,
  BadgeCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CandidateCard } from "@/lib/types";

export default function CandidateBrowsePage() {
  const { status } = useSession();
  const [sectors, setSectors] = useState<Record<string, CandidateCard[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
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
      .then((r) => setSectors(r.sectors))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [status]);

  const sectorList = useMemo(
    () => Object.entries(sectors).sort((a, b) => b[1].length - a[1].length),
    [sectors],
  );

  if (loading) return <p className="text-gray-500">Loading candidates…</p>;

  if (error) {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-2 text-gray-600">{error}</p>
        <a href="/employers" className="mt-3 inline-block text-sm text-brand-700 underline">
          Go to employer registration →
        </a>
      </div>
    );
  }

  if (selected) {
    const cards = sectors[selected] ?? [];
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" /> All sectors
        </button>
        <h1 className="text-2xl font-bold">
          {selected} <span className="text-gray-400">({cards.length})</span>
        </h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <CandidateTile key={c.id} c={c} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-brand-600" /> Browse candidates
        </h1>
        <p className="text-sm text-gray-500">Available talent grouped by sector.</p>
      </div>

      {sectorList.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          No available candidates yet. Check back soon.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sectorList.map(([sector, cards]) => (
            <button
              key={sector}
              onClick={() => setSelected(sector)}
              className="glass rounded-2xl p-6 text-left transition-transform hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white">
                <Briefcase className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{sector}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {cards.length} candidate{cards.length === 1 ? "" : "s"} available
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateTile({ c }: { c: CandidateCard }) {
  return (
    <div className="glass flex flex-col rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-violet-600 text-lg font-bold text-white">
          {c.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{c.name}</h3>
          {c.availability === "looking" && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <BadgeCheck className="h-3 w-3" /> Actively looking
            </span>
          )}
        </div>
      </div>

      {c.headline && <p className="mt-3 text-sm text-gray-700">{c.headline}</p>}

      <div className="mt-3 space-y-1 text-xs text-gray-500">
        {c.location && (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {c.location}
          </p>
        )}
        {c.yearsExperience != null && (
          <p className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" /> {c.yearsExperience} years experience
          </p>
        )}
        {c.education && (
          <p className="flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> {c.education}
          </p>
        )}
        {c.languages && c.languages.length > 0 && (
          <p className="flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5" /> {c.languages.join(", ")}
          </p>
        )}
      </div>

      {c.skills && c.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.skills.slice(0, 6).map((s) => (
            <span key={s} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
              {s}
            </span>
          ))}
        </div>
      )}

      <button
        disabled
        className="mt-4 flex items-center justify-center gap-1 rounded-full bg-gray-100 px-3 py-2 text-sm text-gray-400"
      >
        <Lock className="h-3.5 w-3.5" /> Unlock contact (coming soon)
      </button>
    </div>
  );
}
