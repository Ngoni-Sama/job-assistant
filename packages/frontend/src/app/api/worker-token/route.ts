import { auth } from "@/auth";
import { USER_TOKEN_TTL_SECONDS, signUserToken } from "@/lib/server/usertoken";

export const dynamic = "force-dynamic";

/**
 * GET /api/worker-token — a short-lived signed token proving who the signed-in
 * user is, for the browser to send to the Worker API. Same-origin only (no CORS
 * headers), so other sites can't read it.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  const token = email ? signUserToken(email) : null;
  return Response.json(
    { token, expiresAt: token ? Date.now() + USER_TOKEN_TTL_SECONDS * 1000 : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
