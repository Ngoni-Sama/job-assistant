"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Coins, Loader2, Search, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminUsersPage } from "@/lib/types";

/** Admin → Users: everyone who has used VacancyPal, with counts and credit adjustments. */
export function AdminUsers() {
  const [page, setPage] = useState<AdminUsersPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPage(await api.getAdminUsers(offset, query));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [offset, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function adjust(email: string) {
    const raw = window.prompt(`Credits to add for ${email} (use a minus sign to remove, e.g. -10):`);
    if (raw === null) return;
    const amount = Math.round(Number(raw));
    if (!Number.isFinite(amount) || amount === 0) return;
    setAdjusting(email);
    try {
      const { balance } = await api.adjustCredits(email, amount);
      setPage((p) => (p ? { ...p, users: p.users.map((u) => (u.email === email ? { ...u, credits: balance } : u)) } : p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdjusting(null);
    }
  }

  const t = page?.totals;

  return (
    <div className="space-y-5">
      {t && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Users", value: t.users },
            { label: "With a CV", value: t.withCv },
            { label: "Employers", value: t.employers },
            { label: "Auto-apply on", value: t.autoApplyOn },
            { label: "Notifications on", value: t.notificationsOn },
          ].map((s) => (
            <div key={s.label} className="glass rounded-2xl p-4">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </section>
      )}

      <section className="glass space-y-3 rounded-2xl p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setQuery(q.trim());
          }}
          className="flex gap-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email"
              className="min-w-0 flex-1 py-2 text-sm outline-none"
            />
          </div>
          <button type="submit" className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">
            Search
          </button>
        </form>

        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {loading && !page ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </p>
        ) : page && page.users.length === 0 ? (
          <p className="py-4 text-sm text-gray-400">No users found.</p>
        ) : (
          page && (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2 font-medium sm:px-2">User</th>
                    <th className="px-2 py-2 font-medium">Credits</th>
                    <th className="px-2 py-2 font-medium">CVs</th>
                    <th className="px-2 py-2 font-medium">Applied</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/50">
                  {page.users.map((u) => (
                    <tr key={u.email} className="align-top">
                      <td className="max-w-[260px] px-4 py-2.5 sm:px-2">
                        <p className="truncate font-medium text-gray-800">{u.email}</p>
                        <p className="truncate text-xs text-gray-500">
                          {[u.name, u.mainProfession].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => adjust(u.email)}
                          disabled={adjusting === u.email}
                          title="Add or remove credits"
                          className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        >
                          <Coins className="h-3 w-3" /> {u.credits}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">{u.cvs}</td>
                      <td className="px-2 py-2.5">{u.applications}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.employer && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                u.employer === "approved"
                                  ? "bg-green-100 text-green-700"
                                  : u.employer === "pending"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-600"
                              }`}
                            >
                              Employer · {u.employer}
                            </span>
                          )}
                          {u.availability === "looking" && (
                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-700">Looking</span>
                          )}
                          {u.autoApply && (
                            <span className="flex items-center gap-0.5 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
                              <Zap className="h-3 w-3" /> Auto-apply
                            </span>
                          )}
                          {u.notificationDevices > 0 && (
                            <span className="flex items-center gap-0.5 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                              <BellRing className="h-3 w-3" /> {u.notificationDevices}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {page && page.total > page.pageSize && (
          <div className="flex items-center justify-between pt-2 text-sm text-gray-500">
            <span>
              {page.offset + 1}–{Math.min(page.offset + page.pageSize, page.total)} of {page.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - page.pageSize))}
                disabled={offset === 0 || loading}
                className="rounded-full border px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + page.pageSize)}
                disabled={offset + page.pageSize >= page.total || loading}
                className="rounded-full border px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400">
          “Applied” counts applications sent (by the user or Auto-apply). Click a credit balance to add or remove
          credits.
        </p>
      </section>
    </div>
  );
}
