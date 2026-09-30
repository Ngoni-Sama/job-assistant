import { auth } from "@/auth";
import { fulfilPayment } from "@/lib/server/fulfil";

export const runtime = "nodejs";

/** Called by the /billing page after Pesepay redirects the user back. */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Sign in to continue." }, { status: 401 });

  const { reference } = (await req.json().catch(() => ({}))) as { reference?: string };
  if (!reference) return Response.json({ error: "Missing payment reference." }, { status: 400 });

  try {
    return Response.json(await fulfilPayment(reference, email));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
