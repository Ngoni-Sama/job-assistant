"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { disablePush } from "@/lib/push";

/** Permanently delete the signed-in account (typed confirmation). */
export function DeleteAccount() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (status !== "authenticated") {
    return (
      <button
        onClick={() => signIn("google")}
        className="min-h-11 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white"
      >
        Sign in to delete your account
      </button>
    );
  }

  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      await disablePush().catch(() => {});
      await api.deleteAccount();
      await signOut({ callbackUrl: "/?deleted=1" });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-full border border-red-200 bg-white px-5 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> Delete my account
        </button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <p className="flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This permanently deletes <b>{session?.user?.email}</b> and everything stored about it — your profile, CVs,
              applications, messages, credits and settings. It can’t be undone.
            </span>
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-red-900">Type DELETE to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input" autoComplete="off" />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={confirmDelete}
              disabled={typed !== "DELETE" || busy}
              className="flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
            <button onClick={() => setOpen(false)} className="min-h-11 rounded-full px-4 text-sm text-gray-700 hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
