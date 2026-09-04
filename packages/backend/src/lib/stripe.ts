import type { Env } from "../types";

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceCents: number; // USD
}

export const PACKS: CreditPack[] = [
  { id: "starter", label: "Starter", credits: 100, priceCents: 500 },
  { id: "standard", label: "Standard", credits: 300, priceCents: 1200 },
  { id: "pro", label: "Pro", credits: 1000, priceCents: 3500 },
];

function appUrl(env: Env): string {
  return env.APP_URL || "https://job-assistant-frontend-tau.vercel.app";
}

/** Create a Stripe Checkout Session for a credit pack. Returns the hosted URL. */
export async function createCheckoutSession(
  env: Env,
  userId: string,
  packId: string,
): Promise<string> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Billing is not configured (no Stripe key).");
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown pack");

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${appUrl(env)}/billing?checkout=success`);
  body.set("cancel_url", `${appUrl(env)}/billing?checkout=cancel`);
  body.set("client_reference_id", userId);
  body.set("metadata[userId]", userId);
  body.set("metadata[credits]", String(pack.credits));
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(pack.priceCents));
  body.set("line_items[0][price_data][product_data][name]", `${pack.credits} AI credits`);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Stripe did not return a checkout URL");
  return data.url;
}

/**
 * Verify a Stripe webhook signature and return the parsed event, or null.
 * Implements the Stripe scheme (t=timestamp, v1=HMAC-SHA256 of `${t}.${body}`)
 * using Web Crypto — Node's crypto isn't available in Workers.
 */
export async function verifyWebhook(
  env: Env,
  payload: string,
  sigHeader: string,
): Promise<Record<string, unknown> | null> {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;

  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return null;

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (!timingSafeEqual(expected, v1)) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
