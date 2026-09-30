import { pesepayConfigured } from "@/lib/pesepay";

export const runtime = "nodejs";

/**
 * Non-secret status for the admin panel: are the Pesepay keys and the Worker
 * shared secret present on THIS host? Never returns the keys themselves.
 */
export async function GET() {
  return Response.json({
    pesepayConfigured: pesepayConfigured(),
    internalSecretConfigured: !!process.env.WORKER_INTERNAL_SECRET,
    appUrl: process.env.APP_URL || process.env.AUTH_URL || null,
  });
}
