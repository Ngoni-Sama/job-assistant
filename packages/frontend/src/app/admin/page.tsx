"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  Shield,
  Save,
  KeyRound,
  ToggleLeft,
  Database,
  Users,
  UserPlus,
  Trash2,
  Building2,
  Check,
  X,
  ShieldCheck,
  Megaphone,
  Globe,
  CreditCard,
  Coins,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  UserRound,
  PlugZap,
} from "lucide-react";

/** Paid actions and what they're called on the site. */
const PRICED_ACTIONS: { key: keyof ActionCosts; label: string; body: string }[] = [
  { key: "optimise", label: "AI Apply", body: "Tailor one application with AI (also each AI auto-apply, and profile from CV)" },
  { key: "quickMatch", label: "Quick Match", body: "Analyse all listings against the CV" },
  { key: "matchAll", label: "Match all jobs", body: "Score the latest jobs against the CV" },
  { key: "unlockContact", label: "Unlock a candidate", body: "Employer reveals one candidate's contact details" },
  { key: "atsCv", label: "ATS CV (AI-written)", body: "CV Creator: AI writes the summary, bullets and skills (the ATS score check stays free)" },
  { key: "cvQuestions", label: "CV interview questions", body: "AI follow-up questions for one job in the CV interview (0 = free; capped at 30 a day per person)" },
];
import { api, payments } from "@/lib/api";
import type { ActionCosts, AppConfig, CandidateCheck, CreditPack, Employer } from "@/lib/types";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminPrompts } from "@/components/admin/AdminPrompts";

type Tab = "users" | "site" | "payments" | "ai" | "moderation" | "team" | "updates";
const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: "users", label: "Users", icon: UserRound },
  { id: "site", label: "Site", icon: Globe },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "moderation", label: "Moderation", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "updates", label: "Updates", icon: Megaphone },
];

type Health = { pesepayConfigured: boolean; internalSecretConfigured: boolean; appUrl: string | null };

export default function AdminPage() {
  const { status } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [health, setHealth] = useState<Health | null>(null);
  const [defaultPacks, setDefaultPacks] = useState<CreditPack[]>([]);
  const [packsDraft, setPacksDraft] = useState<CreditPack[]>([]);
  const [siteDraft, setSiteDraft] = useState<AppConfig["site"] | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const [bootstrap, setBootstrap] = useState<string[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [checks, setChecks] = useState<{ userId: string; check: CandidateCheck; name: string }[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keyTest, setKeyTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [costsDraft, setCostsDraft] = useState<ActionCosts | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const t = localStorage.getItem("admin:tab") as Tab | null;
      if (t && TABS.some((x) => x.id === t)) setTab(t);
    } catch {
      /* ignore */
    }
  }, []);

  function pickTab(t: Tab) {
    setTab(t);
    setMsg("");
    setError("");
    try {
      localStorage.setItem("admin:tab", t);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "unauthenticated") setAllowed(false);
      return;
    }
    (async () => {
      try {
        const me = await api.getMe();
        setAllowed(me.isAdmin);
        if (!me.isAdmin) return;
        const cfg = (await api.getAdminConfig()).config;
        setConfig(cfg);
        setSiteDraft(cfg.site);
        setCostsDraft(cfg.costs);
        const p = await api.getPacks();
        setDefaultPacks(p.packs);
        setPacksDraft(cfg.packs.length ? cfg.packs : p.packs);
        const a = await api.getAdmins();
        setInvited(a.invited);
        setBootstrap(a.bootstrap);
        setEmployers((await api.getAdminEmployers()).employers);
        setChecks((await api.getAdminChecks()).items);
        payments.health().then(setHealth).catch(() => setHealth(null));
      } catch (e) {
        setError((e as Error).message);
        setAllowed(false);
      }
    })();
  }, [status]);

  async function save(patch: Partial<AppConfig>, okMsg = "Saved.") {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await api.saveAdminConfig(patch);
      setConfig(res.config);
      setKeyInput("");
      setMsg(okMsg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

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

  async function setEmployer(userId: string, s: Employer["status"]) {
    let reason: string | undefined;
    if (s === "rejected") {
      reason = window.prompt("Reason for rejection (shown to the employer):") ?? undefined;
      if (reason === undefined) return;
    }
    try {
      const res = await api.setEmployerStatus(userId, s, reason);
      setEmployers(res.employers);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function setCheck(uid: string, checkId: string, s: CandidateCheck["status"]) {
    await api.setCheckStatus(uid, checkId, s).catch((e) => setError((e as Error).message));
    setChecks((prev) =>
      prev.map((it) => (it.userId === uid && it.check.checkId === checkId ? { ...it, check: { ...it.check, status: s } } : it)),
    );
  }

  async function postAnn(e: React.FormEvent) {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    try {
      await api.postAnnouncement(annTitle.trim(), annBody.trim());
      setAnnTitle("");
      setAnnBody("");
      setMsg("Announcement posted — users will see it in their bell.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function viewDoc(userId: string) {
    try {
      const { data, type } = await api.getEmployerDoc(userId);
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([bytes], { type: type || "application/octet-stream" })), "_blank");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function updatePack(i: number, patch: Partial<CreditPack>) {
    setPacksDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  if (status === "loading" || allowed === null) return <p className="text-gray-500">Loading…</p>;

  if (status !== "authenticated") {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-2 text-gray-600">Admin area — please sign in.</p>
        <button onClick={() => signIn("google")} className="mt-3 rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
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

  if (!config || !siteDraft) return <p className="text-gray-500">Loading config…</p>;

  const pendingEmployers = employers.filter((e) => e.status === "pending").length;
  const pendingChecks = checks.filter((c) => c.check.status === "pending").length;

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Shield className="h-6 w-6 text-brand-600" /> Admin
        </h1>
        <span className="text-xs text-gray-500">{config.site.name}</span>
      </div>

      {/* Tabs */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const badge = t.id === "moderation" ? pendingEmployers + pendingChecks : 0;
          return (
            <button
              key={t.id}
              onClick={() => pickTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                tab === t.id ? "bg-brand-600 text-white shadow-sm" : "bg-white/60 text-gray-600 hover:bg-white"
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
              {badge > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {msg && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{msg}</p>}

      {/* ---------------- USERS ---------------- */}
      {tab === "users" && <AdminUsers />}

      {/* ---------------- SITE ---------------- */}
      {tab === "site" && (
        <section className="glass space-y-4 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Globe className="h-4 w-4" /> Site settings
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Site name">
              <input value={siteDraft.name} onChange={(e) => setSiteDraft({ ...siteDraft, name: e.target.value })} className="input" />
            </Field>
            <Field label="Support email">
              <input
                type="email"
                value={siteDraft.supportEmail}
                onChange={(e) => setSiteDraft({ ...siteDraft, supportEmail: e.target.value })}
                placeholder="support@vacancypal.co.zw"
                className="input"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Tagline">
                <input value={siteDraft.tagline} onChange={(e) => setSiteDraft({ ...siteDraft, tagline: e.target.value })} className="input" />
              </Field>
            </div>
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={siteDraft.maintenanceMode}
              onChange={(e) => setSiteDraft({ ...siteDraft, maintenanceMode: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Maintenance banner</span>
              <span className="block text-gray-500">Shows a site-wide notice to all visitors.</span>
            </span>
          </label>
          <button
            onClick={() => save({ site: siteDraft }, "Site settings saved.")}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save site settings
          </button>
        </section>
      )}

      {/* ---------------- PAYMENTS ---------------- */}
      {tab === "payments" && (
        <div className="space-y-5">
          <section className="glass space-y-4 rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <CreditCard className="h-4 w-4" /> Payment gateway
            </h2>
            <p className="text-sm text-gray-500">
              Pesepay handles <b>Visa, Mastercard, EcoCash, OneMoney</b> and other local methods on its hosted page.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["pesepay", "none"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => save({ payments: { ...config.payments, provider: p } }, p === "none" ? "Top-ups disabled." : "Pesepay enabled.")}
                  className={`rounded-full px-3 py-1.5 text-sm ${config.payments.provider === p ? "bg-brand-600 text-white" : "bg-white/60"}`}
                >
                  {p === "pesepay" ? "Pesepay (live)" : "Top-ups off"}
                </button>
              ))}
            </div>

            {/* Host status */}
            <div className="space-y-2 rounded-xl bg-white/60 p-4 text-sm">
              <p className="font-medium">Status on this server</p>
              <StatusRow ok={!!health?.pesepayConfigured} label="Pesepay keys (PESEPAY_INTEGRATION_KEY + PESEPAY_ENCRYPTION_KEY)" />
              <StatusRow ok={!!health?.internalSecretConfigured} label="Worker link (WORKER_INTERNAL_SECRET)" />
              <StatusRow ok={!!health?.appUrl} label={`Public URL (APP_URL)${health?.appUrl ? ` — ${health.appUrl}` : ""}`} />
              <p className="pt-1 text-xs text-gray-500">
                Keys are set as server environment variables — never here — so they can’t leak from the browser or the
                public repo. Rotate them in the Pesepay dashboard if they’re ever exposed.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Currency">
                <select
                  value={config.payments.currency}
                  onChange={(e) => save({ payments: { ...config.payments, currency: e.target.value } })}
                  className="input"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="ZWG">ZWG — Zimbabwe Gold</option>
                </select>
              </Field>
              <Field label="Free credits for new accounts">
                <input
                  type="number"
                  min={0}
                  defaultValue={config.payments.freeCredits}
                  onBlur={(e) =>
                    save({ payments: { ...config.payments, freeCredits: Math.max(0, Number(e.target.value) || 0) } })
                  }
                  className="input"
                />
              </Field>
            </div>
          </section>

          {costsDraft && (
            <section className="glass space-y-3 rounded-2xl p-6">
              <h2 className="flex items-center gap-2 font-semibold">
                <Coins className="h-4 w-4 text-amber-500" /> Credit prices
              </h2>
              <p className="text-sm text-gray-500">How many credits each paid action costs. 0 makes it free.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PRICED_ACTIONS.map((a) => (
                  <label key={a.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 p-3">
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium">{a.label}</span>
                      <span className="block text-xs text-gray-500">{a.body}</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={costsDraft[a.key]}
                      onChange={(e) => setCostsDraft({ ...costsDraft, [a.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                      className="input w-20 shrink-0 text-right"
                      aria-label={`${a.label} price in credits`}
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => save({ costs: costsDraft }, "Prices saved.")}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Save prices
                </button>
                <button
                  onClick={() => {
                    const defaults = { quickMatch: 10, optimise: 3, matchAll: 5, unlockContact: 20, atsCv: 40, cvQuestions: 0 };
                    setCostsDraft(defaults);
                    save({ costs: defaults }, "Prices reset to defaults.");
                  }}
                  className="rounded-full px-3 py-1.5 text-sm text-gray-500 hover:bg-white/60"
                >
                  Reset to defaults
                </button>
              </div>
            </section>
          )}

          <section className="glass space-y-3 rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Coins className="h-4 w-4 text-amber-500" /> Top-up packs
            </h2>
            <p className="text-sm text-gray-500">What users can buy on the top-up page. Prices in {config.payments.currency}.</p>
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-medium text-gray-500 sm:grid">
                <span>Name</span>
                <span>Credits</span>
                <span>Price</span>
                <span />
              </div>
              {packsDraft.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-white/60 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input
                    value={p.label}
                    onChange={(e) => updatePack(i, { label: e.target.value, id: p.id || e.target.value.toLowerCase().replace(/\W+/g, "-") })}
                    placeholder="Starter"
                    className="input"
                  />
                  <input
                    type="number"
                    min={1}
                    value={p.credits}
                    onChange={(e) => updatePack(i, { credits: Number(e.target.value) })}
                    className="input"
                  />
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={(p.priceCents / 100).toString()}
                    onChange={(e) => updatePack(i, { priceCents: Math.round(Number(e.target.value) * 100) })}
                    className="input"
                  />
                  <button
                    onClick={() => setPacksDraft(packsDraft.filter((_, idx) => idx !== i))}
                    className="flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove pack"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPacksDraft([...packsDraft, { id: `pack-${Date.now()}`, label: "New pack", credits: 100, priceCents: 500 }])}
                className="flex items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 py-1.5 text-sm text-brand-700"
              >
                <Plus className="h-4 w-4" /> Add pack
              </button>
              <button
                onClick={() => save({ packs: packsDraft.map((p) => ({ ...p, id: p.id || p.label.toLowerCase().replace(/\W+/g, "-") })) }, "Packs saved.")}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Save packs
              </button>
              <button
                onClick={() => {
                  setPacksDraft(defaultPacks);
                  save({ packs: [] }, "Reset to default packs.");
                }}
                className="rounded-full px-3 py-1.5 text-sm text-gray-500 hover:bg-white/60"
              >
                Reset to defaults
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ---------------- AI ---------------- */}
      {tab === "ai" && (
        <div className="space-y-5">
          <section className="glass space-y-4 rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4" /> AI provider
            </h2>
            <p className="text-sm text-gray-500">Engine for matching, quick match and profile extraction.</p>
            <div className="flex gap-2">
              {(["workers-ai", "openai"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => save({ aiProvider: p })}
                  className={`rounded-full px-3 py-1.5 text-sm ${config.aiProvider === p ? "bg-brand-600 text-white" : "bg-white/60"}`}
                >
                  {p === "workers-ai" ? "Cloudflare Workers AI" : "OpenAI"}
                </button>
              ))}
            </div>

            <Field label="OpenAI API key">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={config.openaiApiKey ?? "sk-…"}
                  className="input min-w-0 flex-1"
                />
                <button
                  onClick={() => save({ openaiApiKey: keyInput }, "OpenAI key saved.")}
                  disabled={saving || !keyInput}
                  className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Save
                </button>
                <button
                  onClick={async () => {
                    setKeyTest(null);
                    try {
                      setKeyTest(await api.testOpenAI());
                    } catch (e) {
                      setKeyTest({ ok: false, message: (e as Error).message });
                    }
                  }}
                  disabled={!config.openaiApiKey}
                  className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                >
                  <PlugZap className="h-4 w-4" /> Test
                </button>
              </div>
              {keyTest && (
                <p className={`mt-1 text-xs ${keyTest.ok ? "text-green-700" : "text-red-600"}`}>{keyTest.message}</p>
              )}
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                {config.openaiApiKey ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Key set ({config.openaiApiKey})
                  </>
                ) : (
                  "No key set."
                )}{" "}
                Stored server-side; only the last 4 characters are ever shown.
              </p>
            </Field>

            <Field label="OpenAI model">
              <input
                defaultValue={config.openaiModel}
                onBlur={(e) => e.target.value !== config.openaiModel && save({ openaiModel: e.target.value })}
                className="input"
              />
            </Field>

            <label className="flex items-start gap-3 rounded-xl bg-white/60 p-3">
              <input
                type="checkbox"
                checked={config.openaiForDocuments}
                onChange={(e) => save({ openaiForDocuments: e.target.checked })}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm">
                <span className="font-medium">Use OpenAI for CV &amp; cover-letter generation</span>
                <span className="block text-gray-500">
                  AI Apply writes tailored CVs with OpenAI (when a key is set) even while the rest of the app runs on
                  Workers AI. Falls back to Workers AI automatically if OpenAI errors.
                </span>
              </span>
            </label>
          </section>

          <AdminPrompts config={config} save={save} saving={saving} />

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
        </div>
      )}

      {/* ---------------- MODERATION ---------------- */}
      {tab === "moderation" && (
        <div className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Building2 className="h-4 w-4" /> Employer approvals
            </h2>
            <p className="mt-1 text-sm text-gray-500">Review and approve companies before they can browse candidates.</p>
            <ul className="mt-3 divide-y divide-white/40">
              {employers.length === 0 ? (
                <li className="py-3 text-sm text-gray-400">No employer applications yet.</li>
              ) : (
                employers.map((e) => (
                  <li key={e.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.company}</p>
                      <p className="truncate text-xs text-gray-500">
                        {e.contactPerson} · {e.userId}
                      </p>
                      {e.documentName ? (
                        <button onClick={() => viewDoc(e.userId)} className="text-xs text-brand-700 underline">
                          📄 View document
                        </button>
                      ) : (
                        <span className="text-xs text-amber-600">No document uploaded</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          e.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : e.status === "rejected"
                              ? "bg-red-100 text-red-600"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {e.status}
                      </span>
                      {e.status !== "approved" && (
                        <button onClick={() => setEmployer(e.userId, "approved")} className="rounded-md p-1.5 text-green-600 hover:bg-green-50" aria-label="Approve">
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {e.status !== "rejected" && (
                        <button onClick={() => setEmployer(e.userId, "rejected")} className="rounded-md p-1.5 text-red-600 hover:bg-red-50" aria-label="Reject">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> Verification checks
            </h2>
            <p className="mt-1 text-sm text-gray-500">Clear or fail candidate check requests.</p>
            <ul className="mt-3 divide-y divide-white/40">
              {pendingChecks === 0 ? (
                <li className="py-3 text-sm text-gray-400">No pending checks.</li>
              ) : (
                checks
                  .filter((c) => c.check.status === "pending")
                  .map((it) => (
                    <li key={it.userId + it.check.checkId} className="flex items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{it.name}</p>
                        <p className="truncate text-xs text-gray-500">{it.userId}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setCheck(it.userId, it.check.checkId, "cleared")} className="rounded-md p-1.5 text-green-600 hover:bg-green-50" aria-label="Clear">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setCheck(it.userId, it.check.checkId, "failed")} className="rounded-md p-1.5 text-red-600 hover:bg-red-50" aria-label="Fail">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))
              )}
            </ul>
          </section>
        </div>
      )}

      {/* ---------------- TEAM ---------------- */}
      {tab === "team" && (
        <section className="glass rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4" /> Admins
          </h2>
          <p className="mt-1 text-sm text-gray-500">Invite others by their Google email to give them admin access.</p>
          <form onSubmit={invite} className="mt-3 flex flex-wrap gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="input min-w-0 flex-1"
            />
            <button type="submit" className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700">
              <UserPlus className="h-4 w-4" /> Invite
            </button>
          </form>
          <ul className="mt-4 divide-y divide-white/40">
            {bootstrap.map((email) => (
              <li key={email} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{email}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">owner</span>
              </li>
            ))}
            {invited.map((email) => (
              <li key={email} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{email}</span>
                <button onClick={() => removeAdmin(email)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${email}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {invited.length === 0 && <li className="py-2 text-sm text-gray-400">No invited admins yet.</li>}
          </ul>
        </section>
      )}

      {/* ---------------- UPDATES ---------------- */}
      {tab === "updates" && (
        <div className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Megaphone className="h-4 w-4" /> Post an update
            </h2>
            <p className="mt-1 text-sm text-gray-500">Notifies all users via the bell icon.</p>
            <form onSubmit={postAnn} className="mt-3 space-y-2">
              <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Title" className="input" />
              <textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="What's new…" rows={3} className="input" />
              <button type="submit" className="rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
                Post update
              </button>
            </form>
          </section>
          <section className="glass rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4" /> Storage
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Current: <span className="font-medium">Cloudflare KV</span> (jobs, CVs, prefs, config, credits).
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      )}
      <span className={ok ? "text-gray-700" : "text-amber-800"}>
        {label} — {ok ? "configured" : "missing"}
      </span>
    </p>
  );
}
