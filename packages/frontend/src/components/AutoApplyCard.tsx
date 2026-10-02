"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Zap, ShieldCheck, AlertTriangle, Play, Sparkles, Mail, Coins, X, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { SECTORS } from "@/lib/sectors";
import type { AutoApplyStatus, Prefs } from "@/lib/types";

const LIMITS = [1, 2, 3, 5, 10, 15, 20];

/**
 * Auto-apply: the server applies to new jobs matching the chosen sectors /
 * keywords (and job types), from the user's own Gmail, within a daily limit.
 */
export function AutoApplyCard({
  prefs,
  savePrefs,
  suggestedSector,
}: {
  prefs: Prefs;
  savePrefs: (patch: Partial<Prefs>) => Promise<void>;
  suggestedSector?: string;
}) {
  const [status, setStatus] = useState<AutoApplyStatus | null>(null);
  const [keyword, setKeyword] = useState("");
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const sectors = prefs.autoApplySectors ?? [];
  const keywords = prefs.autoApplyKeywords ?? [];
  const hasTargets = sectors.length > 0 || keywords.length > 0;

  const refresh = () => api.getAutoApply().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
  }, [prefs.autoApply]);

  async function toggle(on: boolean) {
    setError("");
    setMsg("");
    if (on && !hasTargets) {
      setError("Pick at least one sector or keyword below first, so it only applies to jobs you want.");
      return;
    }
    await savePrefs({ autoApply: on });
    if (on && !status?.authorized) {
      // Google sign-in again so the server gets permission to send while you're away.
      signIn("google", { callbackUrl: "/settings?autoapply=authorized#auto-apply" });
    } else {
      refresh();
    }
  }

  function toggleSector(s: string) {
    savePrefs({ autoApplySectors: sectors.includes(s) ? sectors.filter((x) => x !== s) : [...sectors, s] });
  }
  function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    const k = keyword.trim();
    if (!k || keywords.some((x) => x.toLowerCase() === k.toLowerCase())) return;
    savePrefs({ autoApplyKeywords: [...keywords, k] });
    setKeyword("");
  }

  async function runNow() {
    setRunning(true);
    setError("");
    setMsg("");
    try {
      const r = await api.runAutoApply();
      if (r.error) setError(r.error);
      else setMsg(r.sent ? `Sent ${r.sent} application${r.sent === 1 ? "" : "s"} 🎉` : "No new matching jobs with an email address right now.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const limit = prefs.autoApplyDailyLimit ?? 5;
  const disabledByAdmin = status && !status.allowed;

  return (
    <section id="auto-apply" className="glass scroll-mt-24 space-y-4 rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Zap className="h-5 w-5 text-amber-500" /> Auto-apply
          </h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            We check for new jobs every few hours and apply for you — from <b>your own Gmail</b>, with your uploaded
            CV attached — to jobs that match what you pick below and list an email address.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <span className="text-sm font-medium">{prefs.autoApply ? "On" : "Off"}</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={prefs.autoApply}
            disabled={!!disabledByAdmin}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span className="relative h-6 w-11 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand-600 peer-checked:after:translate-x-5 peer-disabled:opacity-50" />
        </label>
      </div>

      {disabledByAdmin && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Auto-apply is currently disabled by the site admin.</p>
      )}

      {/* Authorization status */}
      {prefs.autoApply && status && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm ${
            status.authorized ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {status.authorized ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span className="flex-1">
            {status.authorized
              ? `Gmail authorized · ${status.sentToday}/${limit} sent in the last 24 hours`
              : "Gmail not authorized yet — VacancyPal can't send while you're away until you confirm with Google."}
          </span>
          {!status.authorized && (
            <button
              onClick={() => signIn("google", { callbackUrl: "/settings?autoapply=authorized#auto-apply" })}
              className="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white"
            >
              Authorize Gmail
            </button>
          )}
        </div>
      )}

      {/* Targeting */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sectors to apply to</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SECTORS.map((s) => {
            const on = sectors.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSector(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  on ? "bg-brand-600 text-white" : "bg-white/70 text-gray-600 hover:bg-white"
                } ${!on && s === suggestedSector ? "ring-1 ring-brand-300" : ""}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Or job-title keywords</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {keywords.map((k) => (
            <span key={k} className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700">
              {k}
              <button onClick={() => savePrefs({ autoApplyKeywords: keywords.filter((x) => x !== k) })} aria-label={`Remove ${k}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <form onSubmit={addKeyword} className="flex items-center gap-1">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. nurse, accountant"
              className="input h-8 w-44 py-1 text-xs"
            />
            <button type="submit" className="rounded-full p-1.5 text-brand-700 hover:bg-white/70" aria-label="Add keyword">
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Job types (Full Time, Contract…) are taken from <b>My categories</b> below — leave them empty to allow any type.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          Max per day
          <select
            value={limit}
            onChange={(e) => savePrefs({ autoApplyDailyLimit: Number(e.target.value) })}
            className="input h-9 w-20 py-1"
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!prefs.autoApplyUseAI}
            onChange={(e) => savePrefs({ autoApplyUseAI: e.target.checked })}
            className="h-4 w-4"
          />
          <Sparkles className="h-4 w-4 text-violet-600" /> AI-tailored cover note
          <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
            <Coins className="h-3 w-3" /> 3 each
          </span>
        </label>
      </div>

      <p className="text-xs text-gray-500">
        Safety: only jobs with an employer email · never the same job twice · never the same employer address twice
        within 30 days · stops at your daily limit. Turning auto-apply off deletes the stored Google permission.
      </p>

      {prefs.autoApply && status?.authorized && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runNow}
            disabled={running}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> {running ? "Applying…" : "Run now"}
          </button>
          {status.lastRun && (
            <span className="text-xs text-gray-500">Last run {new Date(status.lastRun).toLocaleString()}</span>
          )}
        </div>
      )}

      {msg && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{msg}</p>}
      {(error || status?.lastError) && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error || status?.lastError}</p>
      )}

      {status && status.recent.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recently auto-applied</p>
          <ul className="mt-2 divide-y divide-white/50 text-sm">
            {status.recent.map((r) => (
              <li key={r.jobId + r.at} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-gray-500"> · {r.company}</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Mail className="h-3.5 w-3.5" /> {r.to} · {new Date(r.at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
