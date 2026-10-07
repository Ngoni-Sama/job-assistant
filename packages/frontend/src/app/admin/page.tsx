"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  Shield,
  Save,
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
  Sparkles,
  UserRound,
} from "lucide-react";

import { api, payments } from "@/lib/api";
import type { AppConfig, CandidateCheck, CreditPack, Employer } from "@/lib/types";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminPrompts } from "@/components/admin/AdminPrompts";
import { AiPricing } from "@/components/admin/AiPricing";
import { AdminReports } from "@/components/admin/AdminReports";

type Tab = "users" | "pricing" | "site" | "moderation" | "team" | "updates";
const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: "users", label: "Users", icon: UserRound },
  { id: "pricing", label: "AI & Pricing", icon: Sparkles },
  { id: "site", label: "Site", icon: Globe },
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
  const [siteDraft, setSiteDraft] = useState<AppConfig["site"] | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const [bootstrap, setBootstrap] = useState<string[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [checks, setChecks] = useState<{ userId: string; check: CandidateCheck; name: string }[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      // ?tab=pricing opens a tab directly; old saved tabs (payments, ai) now live under AI & Pricing.
      const raw = new URLSearchParams(window.location.search).get("tab") ?? localStorage.getItem("admin:tab");
      const t = (raw === "payments" || raw === "ai" ? "pricing" : raw) as Tab | null;
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
        const p = await api.getPacks();
        setDefaultPacks(p.packs);
        const a = await api.getAdmins();
        setInvited(a.invited);
        setBootstrap(a.bootstrap);
        setEmployers((await api.getAdminEmployers()).employers);
        setChecks((await api.getAdminChecks()).items);
        payments.health().then(setHealth).catch(() => setHealth(null));
        api
          .getReports()
          .then((r) => setOpenReports(r.reports.filter((x) => x.status === "open").length))
          .catch(() => {});
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
          const badge = t.id === "moderation" ? pendingEmployers + pendingChecks + openReports : 0;
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
      {tab === "site" && (
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
      )}

      {/* ---------------- AI & PRICING ---------------- */}
      {tab === "pricing" && (
        <div className="space-y-5">
          <AiPricing config={config} save={save} saving={saving} defaultPacks={defaultPacks} health={health} />
          <AdminPrompts config={config} save={save} saving={saving} />
        </div>
      )}

      {/* ---------------- MODERATION ---------------- */}
      {tab === "moderation" && (
        <div className="space-y-5">
          <AdminReports onCount={setOpenReports} />
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

