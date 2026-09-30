import { fulfilPayment } from "@/lib/server/fulfil";

export const runtime = "nodejs";

/**
 * Pesepay's server-to-server result callback (`resultUrl`). It fires even if the
 * user closes the browser before returning, so credits still land. We never
 * trust the callback body — we re-check the payment with Pesepay ourselves.
 */
async function handle(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) return Response.json({ ok: false }, { status: 400 });
  try {
    const result = await fulfilPayment(reference);
    return Response.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("Pesepay callback failed", err);
    // 200 so Pesepay doesn't hammer retries on a permanent error; the return-page
    // verify is the second path that will credit the user.
    return Response.json({ ok: false });
  }
}

export const POST = handle;
export const GET = handle;
