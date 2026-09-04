"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Shield, Save, KeyRound, ToggleLeft, Database, Users, UserPlus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

export default function AdminPage() {
  const { status } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const [bootstrap, setBootstrap] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "unauthenticated") setAllowed(false);
      return;
    }
    (async () => {
      try {
        const me = await api.getMe();
        setAllowed(me.isAdmin);
        if (me.isAdmin) {
          setConfig((await api.getAdminConfig()).config);
          const a = await api.getAdmins();
          setInvited(a.invited);
          setBootstrap(a.bootstrap);
        }
      } catch (e) {
        setError((e as Error).message);
        setAllowed(false);
      }
    })();
  }, [status]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError("");
    setMsg("");
    try {
      const res = await api.addAdmin(inviteEmail.trim());
      setInvited(res.invited);
      setInviteEmail("");
      setMsg("Admin invited.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeAdmin(email: string) {
    try {
      const res = await api.removeAdmin(email);
      setInvited(res.invited);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save(patch: Partial<AppConfig>) {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await api.saveAdminConfig(patch);
      setConfig(res.config);
      setKeyInput("");
      setMsg("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || allowed === null) return <p className="text-gray-500">Loading…</p>;

  if (status !== "authenticated") {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-2 text-gray-600">Admin area — please sign in.</p>
        <button
          onClick={() => signIn("google")}
          className="mt-3 rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-gray-600">
        <Shield className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2">You don’t have admin access.</p>
      </div>
    );
  }

  if (!config) return <p className="text-gray-500">Loading config…</p>;

  const feature = (k: keyof AppConfig["features"], label: string, desc: string) => (
    <label className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={config.features[k]}
        onChange={(e) => save({ features: { ...config.features, [k]: e.target.checked } })}
        className="mt-1 h-4 w-4"
      />
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-gray-500">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Shield className="h-6 w-6 text-brand-600" /> Admin
      </h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}

      {/* AI provider */}
      <section className="glass rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4" /> AI provider
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Which engine generates match scores &amp; tailored CVs.
        </p>
        <div className="mt-3 flex gap-2">
          {(["workers-ai", "openai"] as const).map((p) => (
            <button
              key={p}
              onClick={() => save({ aiProvider: p })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                config.aiProvider === p ? "bg-brand-600 text-white" : "bg-white/60"
              }`}
            >
              {p === "workers-ai" ? "Cloudflare Workers AI" : "OpenAI"}
            </button>
          ))}
        </div>

        {config.aiProvider === "openai" && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500">OpenAI API key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={config.openaiApiKey ?? "sk-…"}
                  className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
                />
                <button
                  onClick={() => save({ openaiApiKey: keyInput })}
                  disabled={saving || !keyInput}
                  className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Save key
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Stored server-side; only the last 4 digits are ever returned.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Model</label>
              <input
                value={config.openaiModel}
                onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
                onBlur={(e) => save({ openaiModel: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </section>

      {/* Feature flags */}
      <section className="glass rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <ToggleLeft className="h-4 w-4" /> Features
        </h2>
        <div className="mt-2 divide-y divide-white/40">
          {feature("vacancymail", "VacancyMail scraping", "Scrape vacancymail.co.zw")}
          {feature("jobszimbabwe", "Jobs Zimbabwe scraping", "Scrape jobszimbabwe.co.zw")}
          {feature("googleJobs", "Google Jobs (Serper)", "Needs SERPER_API_KEY secret")}
          {feature("autoApplyAllowed", "Allow auto-apply", "Let users auto-send applications")}
        </div>
      </section>

      {/* Admins */}
      <section className="glass rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4" /> Admins
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Invite others by their Google email to give them admin access to this panel.
        </p>

        <form onSubmit={invite} className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700"
          >
            <UserPlus className="h-4 w-4" /> Invite
          </button>
        </form>

        <ul className="mt-4 divide-y divide-white/40">
          {bootstrap.map((email) => (
            <li key={email} className="flex items-center justify-between py-2 text-sm">
              <span>{email}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                owner
              </span>
            </li>
          ))}
          {invited.map((email) => (
            <li key={email} className="flex items-center justify-between py-2 text-sm">
              <span>{email}</span>
              <button
                onClick={() => removeAdmin(email)}
                className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${email}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {invited.length === 0 && (
            <li className="py-2 text-sm text-gray-400">No invited admins yet.</li>
          )}
        </ul>
      </section>

      {/* Storage (informational) */}
      <section className="glass rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Database className="h-4 w-4" /> Storage
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Current: <span className="font-medium">Cloudflare KV</span> (jobs, CVs, prefs, config).
          Swapping the datastore is a code change — ask to migrate to D1/Postgres when needed.
        </p>
      </section>
    </div>
  );
}
