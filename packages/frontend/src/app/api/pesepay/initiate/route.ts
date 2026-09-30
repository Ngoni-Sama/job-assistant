import { auth } from "@/auth";
import { initiatePesepay } from "@/lib/pesepay";
import { publicOrigin, workerGet, workerInternal } from "@/lib/server/worker";

export const runtime = "nodejs"; // Node crypto is required for Pesepay encryption

type Pack = { id: string; label: string; credits: number; priceCents: number };

/**
 * Start a Pesepay payment for a credit pack. Returns the hosted-page URL, where
 * the user pays by Visa/Mastercard or EcoCash/local methods.
 */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Sign in to buy credits." }, { status: 401 });

  const { packId } = (await req.json().catch(() => ({}))) as { packId?: string };
  const { packs, provider, currency } = await workerGet<{ packs: Pack[]; provider: string; currency: string }>(
    "/api/billing/packs",
  );
  if (provider !== "pesepay") return Response.json({ error: "Pesepay top-ups are currently disabled." }, { status: 400 });
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return Response.json({ error: "Unknown credit pack." }, { status: 400 });

  const amount = pack.priceCents / 100;
  const reference = `vp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const origin = publicOrigin(req);

  try {
    // Record who is paying for what BEFORE redirecting, so fulfilment is bound
    // to this user and pack price (checked again on verify).
    await workerInternal("/api/internal/pending", { reference, userId: email, credits: pack.credits, amount });

    const result = await initiatePesepay({
      amount,
      currency: currency || "USD",
      reason: `${pack.credits} VacancyPal credits`,
      resultUrl: `${origin}/api/pesepay/callback?reference=${encodeURIComponent(reference)}`,
      returnUrl: `${origin}/billing?ref=${encodeURIComponent(reference)}`,
      reference,
    });

    // Map our reference → Pesepay's reference number so verify can look it up.
    await workerInternal("/api/internal/pending-map", { reference, pesepayRef: result.referenceNumber }).catch(() => {});

    return Response.json({ redirectUrl: result.redirectUrl, reference, pesepayRef: result.referenceNumber });
  } catch (err) {
    return Response.json({ error: (err as Error).message || "Couldn't start the payment." }, { status: 502 });
  }
}
