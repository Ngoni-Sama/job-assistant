"use client";

import { useEffect, useState } from "react";
import { Flag, Trash2, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { ThreadReport } from "@/lib/types";

const REASON: Record<string, string> = {
  scam: "Scam / asking for money",
  harassment: "Harassment or threats",
  inappropriate: "Inappropriate content",
  fake: "Fake job or profile",
  spam: "Spam",
  other: "Something else",
};

/** Conversations users reported. Google Play expects these to be handled promptly. */
export function AdminReports({ onCount }: { onCount?: (open: number) => void }) {
  const [reports, setReports] = useState<ThreadReport[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getReports()
      .then((r) => setReports(r.reports))
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    if (reports) onCount?.(reports.filter((r) => r.status === "open").length);
  }, [reports, onCount]);

  async function resolve(id: string, action: "dismiss" | "delete-thread") {
    if (action === "delete-thread" && !window.confirm("Remove this conversation for both people?")) return;
    try {
      setReports((await api.resolveReport(id, action)).reports);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const shown = (reports ?? []).filter((r) => showResolved || r.status === "open");

  return (
    <section className="glass space-y-3 rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Flag className="h-4 w-4 text-amber-600" /> Reported conversations
        </h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="h-4 w-4" />
          Show resolved
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!reports ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-600">No reports waiting. When someone reports a conversation it shows up here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">{REASON[r.reason] ?? r.reason}</span>
                <span className="text-xs text-gray-500">
                  {new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-gray-700">
                <b>{r.reporter}</b> reported <b>{r.reported}</b>
              </p>
              {r.details && <p className="rounded-lg bg-gray-50 p-2 text-gray-700">“{r.details}”</p>}
              <div className="space-y-1 rounded-lg bg-gray-50 p-2">
                {r.excerpt.map((m, i) => (
                  <p key={i} className="text-xs text-gray-700">
                    <span className="font-semibold capitalize">{m.from}:</span> {m.text}
                  </p>
                ))}
              </div>
              {r.status === "open" ? (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => resolve(r.id, "dismiss")} className="flex min-h-10 items-center gap-1 rounded-full border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50">
                    <Check className="h-4 w-4" /> Dismiss
                  </button>
                  <button onClick={() => resolve(r.id, "delete-thread")} className="flex min-h-10 items-center gap-1 rounded-full px-3 text-sm text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" /> Remove conversation
                  </button>
                </div>
              ) : (
                <p className="text-xs text-green-700">Resolved — {r.resolution}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
