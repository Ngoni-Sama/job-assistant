import "server-only";
import { createCipheriv, createDecipheriv } from "node:crypto";
import https from "node:https";

/**
 * Pesepay (Zimbabwe) client — hosted redirect flow, covering Visa / Mastercard
 * AND local methods (EcoCash, OneMoney …) on Pesepay's page.
 *
 * Ported from the MoLeads client, which is verified live against Pesepay:
 *  - payloads are AES-256-CBC; key = the 32-char encryption key, IV = its first 16 bytes
 *  - the integration key goes in the `key` header
 *  - Pesepay sends a malformed HSTS header that Node's `fetch` (undici) rejects
 *    (HPE_INVALID_HEADER_TOKEN), so requests use node:https + insecureHTTPParser
 *
 * Env (server-only, never sent to the browser):
 *   PESEPAY_INTEGRATION_KEY, PESEPAY_ENCRYPTION_KEY
 */

const BASE_URL = "https://api.pesepay.com/api/payments-engine";
const ALGORITHM = "aes-256-cbc";

function keys(): { integrationKey: string; encryptionKey: string } {
  const integrationKey = process.env.PESEPAY_INTEGRATION_KEY;
  const encryptionKey = process.env.PESEPAY_ENCRYPTION_KEY;
  if (!integrationKey || !encryptionKey) throw new Error("Pesepay is not configured");
  if (encryptionKey.length !== 32) throw new Error("PESEPAY_ENCRYPTION_KEY must be 32 characters");
  return { integrationKey, encryptionKey };
}

export function pesepayConfigured(): boolean {
  return !!process.env.PESEPAY_INTEGRATION_KEY && process.env.PESEPAY_ENCRYPTION_KEY?.length === 32;
}

function encrypt(encryptionKey: string, plaintext: string): string {
  const key = Buffer.from(encryptionKey, "utf8");
  const iv = Buffer.from(encryptionKey.slice(0, 16), "utf8");
  const cipher = createCipheriv(ALGORITHM, key, iv);
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64");
}

function decrypt(encryptionKey: string, ciphertextB64: string): string {
  const key = Buffer.from(encryptionKey, "utf8");
  const iv = Buffer.from(encryptionKey.slice(0, 16), "utf8");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}

function httpsRequest(
  method: "POST" | "GET",
  urlStr: string,
  headers: Record<string, string>,
  bodyStr?: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers,
        insecureHTTPParser: true,
        timeout: 30_000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: data }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Pesepay request timed out")));
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function request<T>(method: "POST" | "GET", url: string, body?: unknown): Promise<T> {
  const { integrationKey, encryptionKey } = keys();
  const bodyStr = body ? JSON.stringify({ payload: encrypt(encryptionKey, JSON.stringify(body)) }) : undefined;
  const { status, text } = await httpsRequest(
    method,
    url,
    {
      key: integrationKey,
      accept: "application/json",
      ...(bodyStr ? { "content-type": "application/json" } : {}),
    },
    bodyStr,
  );
  if (status < 200 || status >= 300) throw new Error(`Pesepay ${status}: ${text.slice(0, 300)}`);
  const envelope = JSON.parse(text) as { payload?: string; message?: string };
  if (!envelope.payload) throw new Error(`Pesepay: no payload (${envelope.message ?? text.slice(0, 200)})`);
  return JSON.parse(decrypt(encryptionKey, envelope.payload)) as T;
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
  pollUrl: string;
  redirectUrl: string;
}

/** Create a hosted transaction and get the Pesepay payment URL. */
export async function initiatePesepay(args: InitiateArgs): Promise<InitiateResult> {
  return request<InitiateResult>("POST", `${BASE_URL}/v1/payments/initiate`, {
    amountDetails: { amount: args.amount, currencyCode: args.currency },
    reasonForPayment: args.reason,
    merchantReference: args.reference,
    transactionType: "BASIC",
    resultUrl: args.resultUrl,
    returnUrl: args.returnUrl,
  });
}

export interface CheckResult {
  referenceNumber?: string;
  transactionStatus?: string; // SUCCESS | FAILED | PROCESSING | CANCELLED | PENDING …
  paid: boolean;
  amount?: number;
}

/**
 * Check a transaction. Prefer the `pollUrl` Pesepay returned at initiation
 * (the verified path); fall back to check-payment by reference number.
 */
export async function checkPesepay(ref: { pollUrl?: string; referenceNumber?: string }): Promise<CheckResult> {
  const url = ref.pollUrl
    ? ref.pollUrl
    : `${BASE_URL}/v1/payments/check-payment?referenceNumber=${encodeURIComponent(ref.referenceNumber ?? "")}`;
  const record = await request<Record<string, unknown>>("GET", url);
  const transactionStatus = typeof record.transactionStatus === "string" ? record.transactionStatus : undefined;
  const details = record.amountDetails as { amount?: unknown } | undefined;
  return {
    transactionStatus,
    referenceNumber: typeof record.referenceNumber === "string" ? record.referenceNumber : undefined,
    paid: transactionStatus?.toUpperCase() === "SUCCESS",
    amount: typeof details?.amount === "number" ? details.amount : undefined,
  };
}
