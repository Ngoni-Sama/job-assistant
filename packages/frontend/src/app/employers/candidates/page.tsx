"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  Mail,
  Zap,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CandidateCard } from "@/lib/types";

import { useCosts } from "@/lib/useCosts";
export default function CandidateBrowsePage() {
  const { status } = useSession();
  const [sectors, setSectors] = useState<Record<string, CandidateCard[]>>({});
  const [professionFilter, setProfessionFilter] = useState("");
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [unlocking, setUnlocking] = useState<string | null>(null);
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
    Promise.all([api.getCandidates(), api.getShortlist().catch(() => ({ unlocked: {} }))])
      .then(([c, s]) => {
        setSectors(c.sectors);
        setUnlocked((s as { unlocked: Record<string, string> }).unlocked ?? {});
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [status]);

  async function unlock(id: string) {
    setUnlocking(id);
    setError("");
    try {
      const { email } = await api.unlockCandidate(id);
      setUnlocked((u) => ({ ...u, [id]: email }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUnlocking(null);
    }
  }

  async function message(c: CandidateCard) {
    const text = window.prompt(`Message to ${c.name}:`);
    if (!text?.trim()) return;
    try {
      await api.messageCandidate(c.id, text.trim());
      window.location.href = "/messages";
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
    const all = sectors[selected] ?? [];
    const q = professionFilter.trim().toLowerCase();
    // Main-profession matches lead; headline and skills still count.
    const cards = q
      ? all
          .filter((c) =>
            [c.mainProfession, c.headline, ...(c.skills ?? [])].some((v) => v?.toLowerCase().includes(q)),
          )
          .sort(
            (a, b) =>
              Number(!!b.mainProfession?.toLowerCase().includes(q)) -
              Number(!!a.mainProfession?.toLowerCase().includes(q)),
          )
      : all;
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" /> All sectors
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            {selected} <span className="text-gray-400">({cards.length})</span>
          </h1>
          <input
            value={professionFilter}
            onChange={(e) => setProfessionFilter(e.target.value)}
            placeholder="Filter by profession, e.g. Nurse"
            aria-label="Filter by profession"
            className="w-full rounded-full border px-4 py-2 text-sm focus:border-brand-500 focus:outline-none sm:w-64"
          />
        </div>
        {cards.length === 0 && q && (
          <p className="glass rounded-2xl p-6 text-center text-sm text-gray-500">
            No candidates in {selected} match “{professionFilter.trim()}”.
          </p>
        )}
        {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <CandidateTile
              key={c.id}
              c={c}
              email={unlocked[c.id]}
              unlocking={unlocking === c.id}
              onUnlock={() => unlock(c.id)}
              onMessage={() => message(c)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-brand-600" /> Browse candidates
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/employers/search"
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-4 py-2 text-sm font-medium text-white shadow-md"
            >
              <Sparkles className="h-4 w-4" /> Find talent with AI
            </Link>
            <Link
              href="/employers/swipe"
              className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-4 py-2 text-sm font-medium text-brand-700"
            >
              <Zap className="h-4 w-4" /> Swipe mode
            </Link>
          </div>
        </div>
        <p className="text-sm text-gray-500">Available talent grouped by sector.</p>
      </div>

      {sectorList.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          No available candidates yet. Check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sectorList.map(([sector, cards]) => (
            <button
              key={sector}
              onClick={() => setSelected(sector)}
              className="glass rounded-2xl p-6 text-left transition-transform hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
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

function CandidateTile({
  c,
  email,
  unlocking,
  onUnlock,
  onMessage,
}: {
  c: CandidateCard;
  email?: string;
  unlocking?: boolean;
  onUnlock: () => void;
  onMessage: () => void;
}) {
  const costs = useCosts();
  return (
    <div className="glass flex flex-col rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold text-white">
          {c.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 truncate font-semibold">
            {c.name}
            {c.verifiedCategories && c.verifiedCategories.length > 0 && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified" />
            )}
          </h3>
          {c.availability === "looking" && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <BadgeCheck className="h-3 w-3" /> Actively looking
            </span>
          )}
        </div>
      </div>

      {c.mainProfession && (
        <span
          title={`Main profession: ${c.mainProfession}`}
          className="mt-3 inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
        >
          <Briefcase className="h-3 w-3 shrink-0" />
          <span className="truncate">{c.mainProfession}</span>
        </span>
      )}
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

      <div className="mt-4 flex gap-2">
        {email ? (
          <a
            href={`mailto:${email}`}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
          >
            <Mail className="h-3.5 w-3.5" /> {email}
          </a>
        ) : (
          <button
            onClick={onUnlock}
            disabled={unlocking}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" /> {unlocking ? "…" : `Unlock · ${costs.unlockContact}`}
          </button>
        )}
        <button
          onClick={onMessage}
          className="flex items-center justify-center gap-1 rounded-full border border-white/50 bg-white/50 px-3 py-2 text-sm text-gray-700 hover:bg-white/70"
          aria-label="Message"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
