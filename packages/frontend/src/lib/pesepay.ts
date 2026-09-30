import "server-only";
import crypto from "crypto";

/**
 * Minimal Pesepay (Zimbabwe) client — redirect flow, which covers Visa /
 * Mastercard AND local methods (EcoCash, OneMoney, Zipit, etc.) on Pesepay's
 * hosted page. Implements their AES-256-CBC payload encryption with Node crypto
 * so it runs on any Node host (Vercel dev, nivacity prod). No external SDK.
 *
 * Keys are read from env and never sent to the browser:
 *   PESEPAY_INTEGRATION_KEY  – sent as the Authorization header
 *   PESEPAY_ENCRYPTION_KEY   – 32-char key used to encrypt/decrypt the payload
 */

const BASE = "https://api.pesepay.com/api/payments-engine/v1";

function keys(): { integration: string; encryption: string } {
  const integration = process.env.PESEPAY_INTEGRATION_KEY;
  const encryption = process.env.PESEPAY_ENCRYPTION_KEY;
  if (!integration || !encryption) throw new Error("Pesepay is not configured");
  if (encryption.length !== 32) throw new Error("PESEPAY_ENCRYPTION_KEY must be 32 characters");
  return { integration, encryption };
}

export function pesepayConfigured(): boolean {
  return !!process.env.PESEPAY_INTEGRATION_KEY && (process.env.PESEPAY_ENCRYPTION_KEY?.length === 32);
}

function encrypt(data: unknown, encKey: string): string {
  const key = Buffer.from(encKey, "utf8"); // 32 bytes → AES-256
  const iv = key.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]).toString("base64");
}

function decrypt<T = Record<string, unknown>>(payload: string, encKey: string): T {
  const key = Buffer.from(encKey, "utf8");
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const out = Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(out) as T;
}

async function call<T>(path: string, method: "GET" | "POST", integration: string, encryption: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", authorization: integration },
    body: body ? JSON.stringify({ payload: encrypt(body, encryption) }) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { payload?: string; message?: string };
  if (!res.ok) throw new Error(json.message || `Pesepay error ${res.status}`);
  // Responses come back as an encrypted payload; some errors come back plain.
  return (json.payload ? decrypt<T>(json.payload, encryption) : (json as unknown as T));
}

export interface InitiateArgs {
  amount: number;
  currency: string; // e.g. "USD"
  reason: string;
  resultUrl: string; // server-to-server callback
  returnUrl: string; // browser return
  reference: string; // our merchant reference
}

export interface InitiateResult {
  referenceNumber: string;
  pollUrl?: string;
  redirectUrl: string;
}

export async function initiatePesepay(args: InitiateArgs): Promise<InitiateResult> {
  const { integration, encryption } = keys();
  return call<InitiateResult>("/payments/initiate", "POST", integration, encryption, {
    amountDetails: { amount: args.amount, currencyCode: args.currency },
    reasonForPayment: args.reason,
    resultUrl: args.resultUrl,
    returnUrl: args.returnUrl,
    merchantReference: args.reference,
  });
}

export interface CheckResult {
  referenceNumber?: string;
  transactionStatus?: string; // SUCCESS | FAILED | PROCESSING | CANCELLED | PENDING …
  paid?: boolean;
  amountDetails?: { amount?: number; currencyCode?: string };
}

export async function checkPesepay(referenceNumber: string): Promise<CheckResult> {
  const { integration, encryption } = keys();
  return call<CheckResult>(
    `/payments/check-payment?referenceNumber=${encodeURIComponent(referenceNumber)}`,
    "GET",
    integration,
    encryption,
  );
}

export function isPaid(r: CheckResult): boolean {
  return r.paid === true || (r.transactionStatus ?? "").toUpperCase() === "SUCCESS";
}
