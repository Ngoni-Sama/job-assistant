"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Wand2, History, ChevronDown, ChevronUp, MapPin, Building2, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { QuickMatchRun } from "@/lib/types";

export default function QuickMatchPage() {
  const { status } = useSession();
  const authed = status === "authenticated";

  const [history, setHistory] = useState<QuickMatchRun[]>([]);
  const [latest, setLatest] = useState<QuickMatchRun | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoading(false);
      return;
    }
    api
      .getQuickMatchHistory()
      .then((r) => {
        setHistory(r.history);
        setLatest(r.history[0] ?? null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [status, authed]);

  async function run() {
    setRunning(true);
    setError("");
    try {
      const { run } = await api.runQuickMatch();
      setLatest(run);
      setHistory((prev) => [run, ...prev].slice(0, 10));
      setOpen(run.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (!authed && status !== "loading") {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-2 text-xl font-bold">Quick Match AI</h1>
        <p className="mt-1 text-gray-600">
          Sign in and upload your CV, then let AI tell you exactly which jobs you can qualify for.
        </p>
        <button
          onClick={() => signIn("google")}
          className="mt-4 rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="glass-strong rounded-3xl p-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
          <Wand2 className="h-3.5 w-3.5" /> Quick Match AI
        </span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          Which jobs can you actually get?
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-gray-600">
          AI reads every current listing against your CV and surfaces the ones you’re a strong fit
          for — saved to your history so you can revisit anytime.
        </p>
        <button
          onClick={run}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-60"
        >
          <Wand2 className={`h-5 w-5 ${running ? "animate-pulse" : ""}`} />
          {running ? "Analysing listings…" : "Run Quick Match"}
        </button>
        {running && <p className="mt-2 text-xs text-gray-500">This can take up to a minute.</p>}
      </div>

      {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700">{error}</div>}

      {latest && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            Strong matches — {latest.results.length} of {latest.analyzedCount} jobs
          </h2>
          {latest.results.length === 0 ? (
            <p className="glass rounded-2xl p-6 text-center text-gray-500">
              No strong matches this time. Try refreshing jobs or updating your CV.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {latest.results.map((r) => (
                <div key={r.jobId} className="glass rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{r.title}</h3>
                    <span className="shrink-0 rounded-full bg-green-100/80 px-2 py-0.5 text-xs font-bold text-green-700">
                      {r.score}%
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-600">
                    <Building2 className="h-3.5 w-3.5" /> {r.company}
                    <span className="mx-1">·</span>
                    <MapPin className="h-3.5 w-3.5" /> {r.location}
                  </p>
                  <p className="mt-2 text-sm text-gray-700">{r.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <History className="h-5 w-5 text-brand-600" /> History
          </h2>
          {history.map((run) => {
            const isOpen = open === run.id;
            return (
              <div key={run.id} className="glass rounded-2xl">
                <button
                  onClick={() => setOpen(isOpen ? null : run.id)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <span className="text-sm">
                    <span className="font-medium">{formatDate(run.createdAt)}</span>
                    <span className="text-gray-500">
                      {" "}
                      · {run.results.length} strong / {run.analyzedCount} analysed
                    </span>
                  </span>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-white/40 p-4">
                    {run.results.length === 0 ? (
                      <p className="text-sm text-gray-500">No strong matches in this run.</p>
                    ) : (
                      run.results.map((r) => (
                        <div key={r.jobId} className="flex items-start justify-between gap-3 text-sm">
                          <div>
                            <p className="font-medium">{r.title}</p>
                            <p className="text-gray-500">
                              {r.company} · {r.location}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-green-100/80 px-2 py-0.5 text-xs font-bold text-green-700">
                            {r.score}%
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {loading && <p className="text-gray-500">Loading history…</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
