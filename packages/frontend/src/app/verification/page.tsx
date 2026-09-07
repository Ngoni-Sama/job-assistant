"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { ShieldCheck, Fingerprint, GraduationCap, Briefcase, FileCheck2, Lock, Clock, CheckCircle2, XCircle, Coins } from "lucide-react";
import { api } from "@/lib/api";
import type { CandidateCheck, CheckType } from "@/lib/types";

const ICON: Record<string, typeof Fingerprint> = {
  Identity: Fingerprint,
  Education: GraduationCap,
  Employment: Briefcase,
  Background: FileCheck2,
};

export default function VerificationPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [catalog, setCatalog] = useState<CheckType[]>([]);
  const [mine, setMine] = useState<CandidateCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    api
      .getChecks()
      .then((r) => {
        setCatalog(r.catalog);
        setMine(r.mine);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [status]);

  const byId = useMemo(() => Object.fromEntries(mine.map((m) => [m.checkId, m])), [mine]);
  const clearedCount = mine.filter((m) => m.status === "cleared").length;

  async function order(checkId: string) {
    if (!authed) return signIn("google");
    setBusy(checkId);
    setError("");
    try {
      const r = await api.orderCheck(checkId);
      setMine(r.mine);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="glass-strong rounded-3xl p-8 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-brand-600" />
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Get verified</h1>
        <p className="mx-auto mt-2 max-w-lg text-gray-600">
          Verified candidates stand out to employers. Order checks below — an admin reviews and clears
          them, then a “Verified” badge shows on your profile.
        </p>
        {clearedCount > 0 && (
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" /> {clearedCount} verified
          </span>
        )}
      </div>

      {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700">{error}</div>}
      {!authed && (
        <div className="glass rounded-2xl p-4 text-center text-sm text-gray-600">
          <Lock className="mx-auto mb-1 h-5 w-5 text-brand-600" /> Sign in to order verification checks.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalog.map((c) => {
          const Icon = ICON[c.category] ?? FileCheck2;
          const status = byId[c.id]?.status;
          return (
            <div key={c.id} className="glass flex flex-col rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold leading-tight">{c.name}</h3>
                  <span className="text-xs text-gray-400">{c.category}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">{c.description}</p>
              <div className="mt-auto pt-3">
                {status === "cleared" ? (
                  <span className="flex items-center justify-center gap-1 rounded-full bg-green-100 px-3 py-2 text-sm font-medium text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> Verified
                  </span>
                ) : status === "pending" ? (
                  <span className="flex items-center justify-center gap-1 rounded-full bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700">
                    <Clock className="h-4 w-4" /> Under review
                  </span>
                ) : (
                  <button
                    onClick={() => order(c.id)}
                    disabled={busy === c.id}
                    className="flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {busy === c.id ? "…" : `Order · ${c.credits} credits`}
                    {status === "failed" && " (retry)"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
