import type { Env } from "../../types";

export interface CreditPackConfig {
  id: string;
  label: string;
  credits: number;
  priceCents: number; // in `payments.currency`
}

/** Credits charged per paid action (admin-editable). */
export interface ActionCosts {
  quickMatch: number; // full batch analysis of all listings
  optimise: number; // AI Apply: tailor one application (also auto-apply with AI)
  matchAll: number; // score all cached jobs
  unlockContact: number; // employer reveals one candidate's contact details
  atsCv: number; // ATS CV Creator: AI writes the whole CV from the user's details
  cvQuestions: number; // CV interview: AI follow-up questions for one role (free by default)
}

export const DEFAULT_COSTS: ActionCosts = { quickMatch: 10, optimise: 3, matchAll: 5, unlockContact: 20, atsCv: 40, cvQuestions: 0 };

/** AI tasks whose instructions an admin can rewrite. */
export type PromptKey = "cvWriter" | "matcher" | "quickMatch" | "profile" | "atsCv" | "cvQuestions";

/**
 * Default instructions per task. The required output format (JSON shape) is
 * NOT part of these — each task appends its own, so an edited prompt can't
 * break the app.
 */
export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  cvWriter:
    "You are a professional CV writer. Using the candidate's CV and the job, write: " +
    "a 3-4 sentence professional summary rewritten to target THIS job, using only facts present in the CV " +
    "(never invent qualifications, employers, dates or skills); and a short, warm 3-4 sentence cover note " +
    "addressed to the hiring team.",
  matcher:
    "You are an expert recruiter. Compare a candidate's CV to a job and judge honestly how well they fit, " +
    "based on the skills, experience and qualifications the job asks for.",
  quickMatch:
    "You are a career advisor. Given a candidate CV and a numbered list of jobs, identify ONLY the jobs the " +
    "candidate is a STRONG fit for and has a realistic chance of qualifying for.",
  profile:
    "You extract a candidate profile from a CV. Use only facts present in the CV. Omit a field if it is unknown.",
  atsCv:
    "You are an expert CV writer who knows how applicant-tracking systems (ATS) read CVs. From the candidate's " +
    "details, write: a professional headline (max 10 words) built around the job they want; a 3-4 sentence " +
    "summary; and for each role 3-5 achievement bullets. Each bullet is one full sentence of 12-25 words that " +
    "starts with a strong action verb (Led, Managed, Processed, Reconciled, Trained, Improved…), says what they " +
    "did AND the scale or result, and uses plain words an ATS can read. Keep EVERY number and fact the candidate " +
    "gave (e.g. '300 invoices a month', '40 supplier accounts', '2 new clerks') — numbers make a CV stronger — " +
    "and turn their notes and question answers into polished bullets. Never invent numbers. Avoid weak phrases like " +
    "'responsible for' or 'duties included'. If a target role or job advert is given, use its wording where it " +
    "honestly matches the candidate's experience. Then list the candidate's own skills, most relevant first. " +
    "Write in clear British English suitable for Zimbabwe and southern Africa.",
  cvQuestions:
    "You are a friendly careers coach helping someone in Zimbabwe write their CV. They tell you a job they did " +
    "and, roughly, what they did there. Ask 3 or 4 short, specific questions they can answer in one line that " +
    "draw out concrete achievements and facts an employer would value: how many people, customers, patients or " +
    "accounts; targets met; money, stock or equipment handled; systems or tools used; problems they solved; " +
    "anything they improved. Don't ask about things they already told you. Use simple, warm English. Also " +
    "suggest up to 8 skills people in this role commonly have — the person will only tick the ones they really have.",
};

const MAX_PROMPT = 4000;

/** The instructions for a task: the admin's version if set, otherwise the default. */
export function promptFor(cfg: AppConfig, key: PromptKey): string {
  const custom = cfg.prompts?.[key]?.trim();
  return custom ? custom.slice(0, MAX_PROMPT) : DEFAULT_PROMPTS[key];
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
  /** Credits per paid action. */
  costs: ActionCosts;
  /** Admin-written AI instructions (missing/empty → DEFAULT_PROMPTS). */
  prompts: Partial<Record<PromptKey, string>>;
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
  costs: DEFAULT_COSTS,
  prompts: {},
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
    costs: { ...DEFAULT_COSTS, ...(stored.costs ?? {}) },
    prompts: stored.prompts ?? {},
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
  // Workers AI JSON mode hands back the already-parsed object — keep it as JSON
  // (String() would give "[object Object]" and every caller's JSON parse would fail).
  if (typeof v === "object") return JSON.stringify(v);
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
