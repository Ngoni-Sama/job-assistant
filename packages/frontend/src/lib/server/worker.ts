import "server-only";

/** Base URL of the Cloudflare Worker API (same default as the browser client). */
export const WORKER_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://job-assistant.ma360-ngoni.workers.dev")
  .trim()
  .replace(/^(?!https?:\/\/)/i, "https://")
  .replace(/\/+$/, "");

/** Call a secret-guarded internal Worker endpoint (server-to-server only). */
export async function workerInternal<T>(path: string, body: unknown): Promise<T> {
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!secret) throw new Error("WORKER_INTERNAL_SECRET is not set");
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Worker ${res.status}`);
  return data;
}

/** Call a normal Worker endpoint as a given user. */
export async function workerGet<T>(path: string, userId = "demo"): Promise<T> {
  const res = await fetch(`${WORKER_BASE}${path}`, { headers: { "x-user-id": userId }, cache: "no-store" });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The public origin of this site. Behind a reverse proxy (nivacity) the request
 * URL can be an internal host, so prefer an explicit env, then forwarded headers.
 */
export function publicOrigin(req: Request): string {
  const env = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (env) return env.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
