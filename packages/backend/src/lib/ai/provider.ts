import type { Env } from "../../types";

export interface CreditPackConfig {
  id: string;
  label: string;
  credits: number;
  priceCents: number; // in `payments.currency`
}

export interface AppConfig {
  aiProvider: "workers-ai" | "openai";
  openaiApiKey?: string;
  openaiModel: string;
  /** Use OpenAI (when a key is set) for CV/cover-letter document generation. */
  openaiForDocuments: boolean;
  features: {
    vacancymail: boolean;
    jobszimbabwe: boolean;
    googleJobs: boolean;
    autoApplyAllowed: boolean;
  };
  payments: {
    provider: "pesepay" | "stripe" | "none";
    currency: string; // e.g. "USD"
    freeCredits: number; // granted to new accounts
  };
  site: {
    name: string;
    tagline: string;
    supportEmail: string;
    maintenanceMode: boolean;
  };
  /** Admin-editable top-up packs. Empty → built-in defaults. */
  packs: CreditPackConfig[];
}

export const DEFAULT_CONFIG: AppConfig = {
  aiProvider: "workers-ai",
  openaiModel: "gpt-4o-mini",
  openaiForDocuments: true,
  features: { vacancymail: true, jobszimbabwe: true, googleJobs: false, autoApplyAllowed: true },
  payments: { provider: "pesepay", currency: "USD", freeCredits: 50 },
  site: {
    name: "VacancyPal",
    tagline: "Sit back, relax — let AI apply for you.",
    supportEmail: "",
    maintenanceMode: false,
  },
  packs: [],
};

const CONFIG_KEY = "config:app";

// Current Workers AI model. The older @cf/meta/llama-3.1-8b-instruct was
// deprecated 2026-05-30; keep this ID pointed at a supported model.
const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function getConfig(env: Env): Promise<AppConfig> {
  const stored = await env.JOBS_CACHE.get<Partial<AppConfig>>(CONFIG_KEY, "json");
  if (!stored) return DEFAULT_CONFIG;
  // Deep-merge nested groups so new settings get defaults on old stored configs.
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    features: { ...DEFAULT_CONFIG.features, ...(stored.features ?? {}) },
    payments: { ...DEFAULT_CONFIG.payments, ...(stored.payments ?? {}) },
    site: { ...DEFAULT_CONFIG.site, ...(stored.site ?? {}) },
    packs: stored.packs ?? [],
  };
}

export async function saveConfig(env: Env, config: AppConfig): Promise<void> {
  await env.JOBS_CACHE.put(CONFIG_KEY, JSON.stringify(config));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Provider-agnostic chat completion. Routes to OpenAI when the admin has
 * configured a key + selected it, otherwise falls back to Cloudflare Workers AI.
 */
/** Coerce any model output shape to a plain string so callers can safely parse it. */
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  // Some providers return an array of content parts or a structured object.
  if (Array.isArray(v)) return v.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("");
  if (typeof v === "object" && "text" in (v as object)) return String((v as { text?: unknown }).text ?? "");
  return String(v);
}

/**
 * Provider-agnostic chat completion. Set `json` to request JSON-mode output
 * (structured responses); it's best-effort — callers should still parse
 * defensively, since JSON mode isn't guaranteed 100% of the time.
 */
export async function chat(env: Env, messages: ChatMessage[], maxTokens = 600, json = false): Promise<string> {
  return run(env, messages, maxTokens, json, false);
}

/**
 * Chat for DOCUMENT generation (tailored CVs, cover letters). Uses OpenAI when
 * an admin has set a key and enabled "OpenAI for documents" — even if the rest
 * of the app runs on Workers AI — then falls back to Workers AI on any failure.
 */
export async function docChat(env: Env, messages: ChatMessage[], maxTokens = 900, json = false): Promise<string> {
  return run(env, messages, maxTokens, json, true);
}

async function run(env: Env, messages: ChatMessage[], maxTokens: number, json: boolean, forDocuments: boolean): Promise<string> {
  const cfg = await getConfig(env);
  const useOpenAI =
    !!cfg.openaiApiKey && (cfg.aiProvider === "openai" || (forDocuments && cfg.openaiForDocuments));

  // Prefer OpenAI when configured, but NEVER let a bad key break the product —
  // fall back to Workers AI if the OpenAI call fails for any reason.
  if (useOpenAI && cfg.openaiApiKey) {
    try {
      return await openaiChat(cfg.openaiApiKey, cfg.openaiModel, messages, maxTokens, json);
    } catch (err) {
      console.error("OpenAI failed — falling back to Workers AI", err);
    }
  }

  const base = { messages, max_tokens: maxTokens };
  // Try JSON mode; if the model rejects `response_format`, retry without it.
  if (json) {
    try {
      const res = (await env.AI.run(WORKERS_AI_MODEL, {
        ...base,
        response_format: { type: "json_object" },
      } as never)) as { response?: unknown };
      return asText(res.response);
    } catch (err) {
      console.error("Workers AI JSON mode failed — retrying plain", err);
    }
  }
  const res = (await env.AI.run(WORKERS_AI_MODEL, base)) as { response?: unknown };
  return asText(res.response);
}

async function openaiChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  json = false,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  return asText(data.choices?.[0]?.message?.content);
}
