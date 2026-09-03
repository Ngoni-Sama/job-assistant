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

  if (cfg.aiProvider === "openai" && cfg.openaiApiKey) {
    return openaiChat(cfg.openaiApiKey, cfg.openaiModel, messages, maxTokens);
  }

  const res = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
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
