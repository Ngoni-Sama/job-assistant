"use client";

import { useState } from "react";
import { Ban, Flag, Loader2, MoreVertical, X } from "lucide-react";
import { api } from "@/lib/api";

const REASONS: { id: string; label: string }[] = [
  { id: "scam", label: "Scam or asking for money" },
  { id: "harassment", label: "Harassment or threats" },
  { id: "inappropriate", label: "Inappropriate or sexual content" },
  { id: "fake", label: "Fake job or fake profile" },
  { id: "spam", label: "Spam" },
  { id: "other", label: "Something else" },
];

/** Report / block the other person in a conversation (Google Play UGC requirement). */
export function ThreadSafety({ threadId, name, onDone }: { threadId: string; name: string; onDone: (msg: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function block() {
    setMenu(false);
    if (!window.confirm(`Block ${name}? They won't be able to message you, and this chat will be hidden.`)) return;
    try {
      await api.blockThread(threadId, true);
      onDone(`${name} is blocked.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitReport() {
    setBusy(true);
    setError("");
    try {
      await api.reportThread(threadId, reason, details.trim(), alsoBlock);
      setReporting(false);
      onDone(alsoBlock ? `Thanks — we’ll review it. ${name} is blocked.` : "Thanks — our team will review this conversation.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenu((v) => !v)}
        aria-label="Report or block"
        aria-expanded={menu}
        className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-white/70"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="popover absolute right-0 z-20 mt-1 w-56 rounded-2xl p-1.5">
            <button
              onClick={() => {
                setMenu(false);
                setReporting(true);
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-gray-800 hover:bg-gray-50"
            >
              <Flag className="h-4 w-4 text-amber-600" /> Report conversation
            </button>
            <button onClick={block} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-red-700 hover:bg-red-50">
              <Ban className="h-4 w-4" /> Block {name}
            </button>
          </div>
        </>
      )}
      {error && <p className="absolute right-0 top-12 w-60 text-right text-xs text-red-600">{error}</p>}

      {reporting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Report conversation">
          <div className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">Report {name}</p>
              <button onClick={() => setReporting(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Our team reads every report. We’ll see the last few messages of this conversation — {name} won’t know who
              reported them.
            </p>
            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <label key={r.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${reason === r.id ? "border-brand-600 bg-brand-50" : "border-gray-200"}`}>
                  <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} className="h-4 w-4" />
                  {r.label}
                </label>
              ))}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Anything else we should know? (optional)</span>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className="input" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="h-4 w-4" />
              Also block {name}
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={submitReport}
              disabled={!reason || busy}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
