import type { Env } from "../../types";

export interface AppConfig {
  aiProvider: "workers-ai" | "openai";
  openaiApiKey?: string;
  openaiModel: string;
  features: {
    vacancymail: boolean;
    jobszimbabwe: boolean;
    googleJobs: boolean;
    autoApplyAllowed: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  aiProvider: "workers-ai",
  openaiModel: "gpt-4o-mini",
  features: { vacancymail: true, jobszimbabwe: true, googleJobs: false, autoApplyAllowed: true },
};

const CONFIG_KEY = "config:app";

// Current Workers AI model. The older @cf/meta/llama-3.1-8b-instruct was
// deprecated 2026-05-30; keep this ID pointed at a supported model.
const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function getConfig(env: Env): Promise<AppConfig> {
  const stored = await env.JOBS_CACHE.get<AppConfig>(CONFIG_KEY, "json");
  return stored ? { ...DEFAULT_CONFIG, ...stored } : DEFAULT_CONFIG;
}

export async function saveConfig(env: Env, config: AppConfig): Promise<void> {
  await env.JOBS_CACHE.put(CONFIG_KEY, JSON.stringify(config));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Provider-agnostic chat completion. Routes to OpenAI when the admin has
 * configured a key + selected it, otherwise falls back to Cloudflare Workers AI.
 */
export async function chat(env: Env, messages: ChatMessage[], maxTokens = 600): Promise<string> {
  const cfg = await getConfig(env);

  // Prefer OpenAI when configured, but NEVER let a bad key break the product —
  // fall back to Workers AI if the OpenAI call fails for any reason.
  if (cfg.aiProvider === "openai" && cfg.openaiApiKey) {
    try {
      return await openaiChat(cfg.openaiApiKey, cfg.openaiModel, messages, maxTokens);
    } catch (err) {
      console.error("OpenAI failed — falling back to Workers AI", err);
    }
  }

  const res = (await env.AI.run(WORKERS_AI_MODEL, {
    messages,
    max_tokens: maxTokens,
  })) as { response?: string };
  return res.response ?? "";
}

async function openaiChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}
