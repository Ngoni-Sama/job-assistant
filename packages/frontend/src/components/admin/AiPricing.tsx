"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  CreditCard,
  KeyRound,
  Loader2,
  Lock,
  PlugZap,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ActionCosts, AiProvider, AiSettings, AppConfig, CreditPack, KeyProvider } from "@/lib/types";

/** Paid actions and what they're called on the site. */
export const PRICED_ACTIONS: { key: keyof ActionCosts; label: string; body: string }[] = [
  { key: "atsCv", label: "ATS CV (AI-written)", body: "CV Creator: AI writes the summary, bullets and skills (the ATS score check stays free)" },
  { key: "optimise", label: "AI Apply", body: "Tailor one application with AI (also each AI auto-apply, and profile from CV)" },
  { key: "quickMatch", label: "Quick Match", body: "Analyse all listings against the CV" },
  { key: "matchAll", label: "Match all jobs", body: "Score the latest jobs against the CV" },
  { key: "unlockContact", label: "Unlock a candidate", body: "Employer reveals one candidate's contact details" },
  { key: "cvQuestions", label: "CV interview questions", body: "AI follow-up questions for one job in the CV interview (0 = free; 30 a day per person)" },
];

const DEFAULT_COSTS: ActionCosts = { quickMatch: 10, optimise: 3, matchAll: 5, unlockContact: 20, atsCv: 40, cvQuestions: 0 };

const PROVIDER_LABEL: Record<AiProvider, string> = {
  "workers-ai": "Cloudflare Workers AI (built in, free)",
  openai: "OpenAI",
  anthropic: "Claude (Anthropic)",
};

const CLAUDE_LABEL: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5 — best writing",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 — faster, cheaper",
  "claude-haiku-4-5": "Claude Haiku 4.5 — cheapest",
};

type Health = { pesepayConfigured: boolean; internalSecretConfigured: boolean; appUrl: string | null } | null;

/**
 * The AI & Pricing dashboard: AI provider keys (encrypted on the server, never
 * shown again), which AI does which job, and every price on the site.
 */
export function AiPricing({
  config,
  save,
  saving,
  defaultPacks,
  health,
}: {
  config: AppConfig;
  save: (patch: Partial<AppConfig>, okMsg?: string) => Promise<void>;
  saving: boolean;
  defaultPacks: CreditPack[];
  health: Health;
}) {
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [aiError, setAiError] = useState("");
  const [costs, setCosts] = useState<ActionCosts>(config.costs);
  const [packs, setPacks] = useState<CreditPack[]>(config.packs.length ? config.packs : defaultPacks);

  useEffect(() => {
    api.getAiSettings().then(setAi).catch((e) => setAiError((e as Error).message));
  }, []);
  useEffect(() => setCosts(config.costs), [config.costs]);
  useEffect(() => {
    if (!config.packs.length && defaultPacks.length) setPacks(defaultPacks);
  }, [config.packs.length, defaultPacks]);

  // What one credit is worth at the entry pack (the one most people buy).
  const entry = packs[0];
  const perCredit = entry && entry.credits > 0 ? entry.priceCents / 100 / entry.credits : 0;
  const money = (n: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency: config.payments.currency || "USD", maximumFractionDigits: 2 }).format(n);

  async function routing(patch: Parameters<typeof api.saveAiSettings>[0]) {
    setAiError("");
    try {
      setAi(await api.saveAiSettings(patch));
    } catch (e) {
      setAiError((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      {/* ---- AI keys ---- */}
      <section className="glass space-y-4 rounded-2xl p-6">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4" /> AI keys
          </h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-600">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            Keys are tested, then encrypted on the server. They’re never shown again — not here, not in the browser, not in
            the code. Only the last 4 characters are displayed so you know which key is in use.
          </p>
          {ai && !ai.encryption && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> The server’s encryption key (TOKEN_KEY) isn’t set, so keys
              can’t be saved yet.
            </p>
          )}
        </div>
        {aiError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{aiError}</p>}
        {!ai ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <KeyCard
              provider="anthropic"
              title="Claude (Anthropic)"
              hint="console.anthropic.com → API keys. Starts with sk-ant-"
              status={ai.keys.anthropic}
              onChange={setAi}
            />
            <KeyCard
              provider="openai"
              title="OpenAI"
              hint="platform.openai.com → API keys. Starts with sk-"
              status={ai.keys.openai}
              onChange={setAi}
            />
          </div>
        )}
      </section>

      {/* ---- Which AI does what ---- */}
      {ai && (
        <section className="glass space-y-4 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Route className="h-4 w-4" /> Which AI does what
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ProviderPick
              label="Writing documents"
              help="ATS CVs, tailored CVs and cover notes, CV interview questions. Worth the best model."
              value={ai.docProvider}
              ai={ai}
              onPick={(p) => routing({ docProvider: p })}
            />
            <ProviderPick
              label="Matching and reading CVs"
              help="Job match scores, Quick Match, profile from CV. High volume — the free built-in AI is usually enough."
              value={ai.aiProvider}
              ai={ai}
              onPick={(p) => routing({ aiProvider: p })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Claude model</span>
              <select value={ai.anthropicModel} onChange={(e) => routing({ anthropicModel: e.target.value })} className="input">
                {[...new Set([...ai.claudeModels, ai.anthropicModel])].map((m) => (
                  <option key={m} value={m}>
                    {CLAUDE_LABEL[m] ?? m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">OpenAI model</span>
              <input
                defaultValue={ai.openaiModel}
                onBlur={(e) => e.target.value.trim() !== ai.openaiModel && routing({ openaiModel: e.target.value.trim() })}
                className="input"
              />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            If the chosen AI fails (bad key, no credit, outage), VacancyPal quietly falls back to the built-in AI so users are
            never stuck — and anyone charged for a failed AI CV gets their credits back.
          </p>
        </section>
      )}

      {/* ---- Prices ---- */}
      <section className="glass space-y-3 rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Coins className="h-4 w-4 text-accent-600" /> What each action costs
        </h2>
        <p className="text-sm text-gray-600">
          In credits. 0 makes it free.
          {perCredit > 0 && ` At the ${entry.label} pack rate one credit is worth ${money(perCredit)}.`}
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {PRICED_ACTIONS.map((a) => (
            <label key={a.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 p-3">
              <span className="min-w-0 text-sm">
                <span className="block font-medium">{a.label}</span>
                <span className="block text-xs text-gray-500">{a.body}</span>
                {perCredit > 0 && costs[a.key] > 0 && (
                  <span className="mt-0.5 block text-xs font-medium text-brand-700">≈ {money(costs[a.key] * perCredit)} to the user</span>
                )}
              </span>
              <input
                type="number"
                min={0}
                max={10000}
                value={costs[a.key]}
                onChange={(e) => setCosts({ ...costs, [a.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                className="input w-24 shrink-0 text-right"
                aria-label={`${a.label} price in credits`}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => save({ costs }, "Prices saved — the site uses them straight away.")}
            disabled={saving}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save prices
          </button>
          <button
            onClick={() => {
              setCosts(DEFAULT_COSTS);
              save({ costs: DEFAULT_COSTS }, "Prices reset to defaults.");
            }}
            className="min-h-10 rounded-full px-3 text-sm text-gray-600 hover:bg-white/60"
          >
            Reset to defaults
          </button>
        </div>
      </section>

      {/* ---- Packs ---- */}
      <section className="glass space-y-3 rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Coins className="h-4 w-4 text-accent-600" /> Credit packs people can buy
        </h2>
        <p className="text-sm text-gray-600">Shown on the Pricing and Credits pages. Prices in {config.payments.currency}.</p>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-medium text-gray-500 md:grid">
            <span>Name</span>
            <span>Credits</span>
            <span>Price</span>
            <span>Per credit</span>
            <span />
          </div>
          {packs.map((p, i) => (
            <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-xl bg-white/70 p-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input
                value={p.label}
                onChange={(e) =>
                  setPacks(packs.map((x, k) => (k === i ? { ...x, label: e.target.value, id: x.id || e.target.value.toLowerCase().replace(/\W+/g, "-") } : x)))
                }
                aria-label="Pack name"
                className="input"
              />
              <input
                type="number"
                min={1}
                value={p.credits}
                onChange={(e) => setPacks(packs.map((x, k) => (k === i ? { ...x, credits: Number(e.target.value) } : x)))}
                aria-label="Credits"
                className="input"
              />
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={(p.priceCents / 100).toString()}
                onChange={(e) => setPacks(packs.map((x, k) => (k === i ? { ...x, priceCents: Math.round(Number(e.target.value) * 100) } : x)))}
                aria-label="Price"
                className="input"
              />
              <span className="px-1 text-sm text-gray-600">{p.credits > 0 ? money(p.priceCents / 100 / p.credits) : "—"}</span>
              <button
                onClick={() => setPacks(packs.filter((_, k) => k !== i))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${p.label}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPacks([...packs, { id: `pack-${Date.now()}`, label: "New pack", credits: 100, priceCents: 500 }])}
            className="flex min-h-10 items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 text-sm text-brand-700"
          >
            <Plus className="h-4 w-4" /> Add pack
          </button>
          <button
            onClick={() => save({ packs: packs.map((p) => ({ ...p, id: p.id || p.label.toLowerCase().replace(/\W+/g, "-") })) }, "Packs saved.")}
            disabled={saving}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save packs
          </button>
          <button
            onClick={() => {
              setPacks(defaultPacks);
              save({ packs: [] }, "Reset to default packs.");
            }}
            className="min-h-10 rounded-full px-3 text-sm text-gray-600 hover:bg-white/60"
          >
            Reset to defaults
          </button>
        </div>
      </section>

      {/* ---- Payments ---- */}
      <section className="glass space-y-4 rounded-2xl p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4" /> Payments
        </h2>
        <p className="text-sm text-gray-600">
          Pesepay handles <b>Visa, Mastercard, EcoCash, OneMoney</b> and other local methods on its own secure page. In the
          Android app, buying is hidden (Google Play rules) — people top up on the website.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["pesepay", "none"] as const).map((p) => (
            <button
              key={p}
              onClick={() => save({ payments: { ...config.payments, provider: p } }, p === "none" ? "Top-ups switched off." : "Pesepay switched on.")}
              className={`min-h-10 rounded-full px-4 text-sm ${config.payments.provider === p ? "bg-brand-600 text-white" : "bg-white/70"}`}
            >
              {p === "pesepay" ? "Pesepay (live)" : "Top-ups off"}
            </button>
          ))}
        </div>
        <div className="space-y-2 rounded-xl bg-white/70 p-4 text-sm">
          <p className="font-medium">Server status</p>
          <StatusRow ok={!!health?.pesepayConfigured} label="Pesepay keys (PESEPAY_INTEGRATION_KEY + PESEPAY_ENCRYPTION_KEY)" />
          <StatusRow ok={!!health?.internalSecretConfigured} label="Worker link (WORKER_INTERNAL_SECRET)" />
          <StatusRow ok={!!health?.appUrl} label={`Public URL (APP_URL)${health?.appUrl ? ` — ${health.appUrl}` : ""}`} />
          <p className="pt-1 text-xs text-gray-500">Payment keys are server settings, never stored here.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Currency</span>
            <select value={config.payments.currency} onChange={(e) => save({ payments: { ...config.payments, currency: e.target.value } })} className="input">
              <option value="USD">USD — US Dollar</option>
              <option value="ZWG">ZWG — Zimbabwe Gold</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Free credits for new accounts</span>
            <input
              type="number"
              min={0}
              defaultValue={config.payments.freeCredits}
              onBlur={(e) => save({ payments: { ...config.payments, freeCredits: Math.max(0, Number(e.target.value) || 0) } }, "Saved.")}
              className="input"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

function KeyCard({
  provider,
  title,
  hint,
  status,
  onChange,
}: {
  provider: KeyProvider;
  title: string;
  hint: string;
  status: { set: boolean; last4?: string; savedAt?: string };
  onChange: (s: AiSettings) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test" | "remove">("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(kind: "save" | "test" | "remove") {
    setBusy(kind);
    setNote(null);
    try {
      if (kind === "save") {
        const r = await api.saveAiKey(provider, value.trim());
        setValue("");
        onChange(r);
        setNote({ ok: true, text: r.message ?? "Saved." });
      } else if (kind === "test") {
        const r = await api.testAiKey(provider);
        setNote({ ok: r.ok, text: r.message });
      } else {
        if (!window.confirm(`Remove the ${title} key? Anything using it falls back to the built-in AI.`)) return;
        const r = await api.removeAiKey(provider);
        onChange(r);
        setNote({ ok: true, text: "Key removed." });
      }
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        {status.set ? (
          <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Key ••••{status.last4}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">No key</span>
        )}
      </div>
      {status.set && status.savedAt && (
        <p className="text-xs text-gray-500">
          Saved {new Date(status.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) act("save");
        }}
        className="flex gap-2"
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.set ? "Paste a new key to replace it" : "Paste your API key"}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${title} API key`}
          className="input min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={!value.trim() || !!busy}
          className="flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
      </form>
      <p className="text-xs text-gray-500">{hint}</p>
      {status.set && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => act("test")}
            disabled={!!busy}
            className="flex min-h-10 items-center gap-1 rounded-full border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Test
          </button>
          <button
            onClick={() => act("remove")}
            disabled={!!busy}
            className="flex min-h-10 items-center gap-1 rounded-full px-3 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        </div>
      )}
      {note && <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>}
    </div>
  );
}

function ProviderPick({
  label,
  help,
  value,
  ai,
  onPick,
}: {
  label: string;
  help: string;
  value: AiProvider;
  ai: AiSettings;
  onPick: (p: AiProvider) => void;
}) {
  const ready = (p: AiProvider) => p === "workers-ai" || (p === "openai" ? ai.keys.openai.set : ai.keys.anthropic.set);
  return (
    <fieldset className="space-y-2 rounded-2xl bg-white/70 p-4">
      <legend className="sr-only">{label}</legend>
      <p className="font-medium">{label}</p>
      <p className="text-xs text-gray-500">{help}</p>
      {(["anthropic", "openai", "workers-ai"] as AiProvider[]).map((p) => (
        <label
          key={p}
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${
            value === p ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-white"
          } ${ready(p) ? "" : "cursor-not-allowed opacity-60"}`}
        >
          <input type="radio" checked={value === p} disabled={!ready(p)} onChange={() => onPick(p)} className="h-4 w-4" />
          {PROVIDER_LABEL[p]}
          {!ready(p) && <span className="ml-auto text-xs text-gray-500">add a key first</span>}
        </label>
      ))}
    </fieldset>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
      <span>{label}</span>
    </p>
  );
}
