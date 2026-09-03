"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Globe, AlertTriangle, Zap } from "lucide-react";
import { api, apiBase } from "@/lib/api";
import type { Prefs, ScrapeSource } from "@/lib/types";

const API_URL = apiBase;

export default function SettingsPage() {
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [prefs, setPrefs] = useState<Prefs>({ autoApply: false, categories: [] });
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");

  useEffect(() => {
    Promise.all([api.getSources(), api.getPrefs(), api.getJobs()])
      .then(([s, p, j]) => {
        setSources(s.sources);
        setPrefs(p.prefs);
        const types = [...new Set(j.jobs.map((job) => job.jobType).filter(Boolean))] as string[];
        setCategoryOptions(types.sort());
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function savePrefs(next: Partial<Prefs>) {
    const optimistic = { ...prefs, ...next };
    setPrefs(optimistic);
    try {
      const res = await api.setPrefs(next);
      setPrefs(res.prefs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleCategory(cat: string) {
    const has = prefs.categories.includes(cat);
    savePrefs({
      categories: has ? prefs.categories.filter((c) => c !== cat) : [...prefs.categories, cat],
    });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    setWarn("");
    try {
      const res = await api.addSource(url.trim(), label.trim() || undefined);
      setSources(res.sources);
      setUrl("");
      setLabel("");
      if (!res.supported) {
        setWarn(
          "Added, but there's no parser for this site yet — vacancymail.co.zw and jobszimbabwe.co.zw are supported out of the box. Others are skipped during scraping.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    try {
      const res = await api.removeSource(target);
      setSources(res.sources);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-lg border bg-white p-6">
        <h2 className="font-semibold">Applications</h2>
        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            checked={prefs.autoApply}
            onChange={(e) => savePrefs({ autoApply: e.target.checked })}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm">
            <span className="flex items-center gap-1 font-medium">
              <Zap className="h-4 w-4 text-amber-500" /> Auto-apply
            </span>
            <span className="text-gray-500">
              When on, clicking Apply sends the tailored application automatically without asking.
              Real email sending only happens when a mail provider is configured on the backend
              (Resend); otherwise the application is prepared for you to send manually.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-lg border bg-white p-6">
        <h2 className="font-semibold">My categories</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick the job types you care about. The Dashboard’s “My categories” filter shows only these.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {categoryOptions.length === 0 ? (
            <p className="text-sm text-gray-400">
              No categories yet — refresh jobs on the Dashboard first.
            </p>
          ) : (
            categoryOptions.map((cat) => {
              const active = prefs.categories.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-brand-300"
                  }`}
                >
                  {cat}
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6">
        <h2 className="font-semibold">Scrape sources</h2>
        <p className="mt-1 text-sm text-gray-500">
          Job boards the scraper pulls from. Built-in support:{" "}
          <code className="rounded bg-gray-100 px-1">vacancymail.co.zw</code> and{" "}
          <code className="rounded bg-gray-100 px-1">jobszimbabwe.co.zw</code>.
        </p>

        <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://vacancymail.co.zw/jobs/"
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-40 rounded-md border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {warn && (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {warn}
          </p>
        )}

        <ul className="mt-4 divide-y">
          {loading ? (
            <li className="py-3 text-sm text-gray-500">Loading…</li>
          ) : sources.length === 0 ? (
            <li className="py-3 text-sm text-gray-500">No sources configured.</li>
          ) : (
            sources.map((s) => (
              <li key={s.url} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.label}</p>
                    <p className="truncate text-xs text-gray-500">{s.url}</p>
                  </div>
                </div>
                <button
                  onClick={() => remove(s.url)}
                  disabled={busy}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Remove ${s.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-6">
        <h2 className="font-semibold">Backend</h2>
        <p className="mt-1 text-sm text-gray-600">
          API endpoint: <code className="rounded bg-gray-100 px-1.5 py-0.5">{API_URL}</code>
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Override with <code>NEXT_PUBLIC_API_URL</code> in <code>.env.local</code> (local dev) or a
          Vercel environment variable.
        </p>
      </section>
    </div>
  );
}
