import { auth } from "@/auth";

/**
 * Check the signed-in user's Gmail for replies from the given recipients (the
 * employers they applied to). Returns the subset of emails that have written to
 * the user. Uses the gmail.readonly scope; the token stays server-side.
 */
export async function POST(req: Request) {
  const session = await auth();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  if (!token) {
    return Response.json({ error: "Sign in with Google to check replies." }, { status: 401 });
  }

  const { recipients } = (await req.json()) as { recipients?: string[] };
  const list = [...new Set((recipients ?? []).filter(Boolean))].slice(0, 25);
  if (list.length === 0) return Response.json({ replied: [] });

  const replied: string[] = [];
  for (const email of list) {
    try {
      const q = encodeURIComponent(`from:${email} newer_than:60d`);
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) {
        return Response.json(
          { error: "Gmail read access not granted — sign out and back in to enable reply detection." },
          { status: 403 },
        );
      }
      if (!res.ok) continue;
      const data = (await res.json()) as { resultSizeEstimate?: number; messages?: unknown[] };
      if ((data.messages?.length ?? 0) > 0 || (data.resultSizeEstimate ?? 0) > 0) {
        replied.push(email);
      }
    } catch {
      /* skip this recipient */
    }
  }

  return Response.json({ replied });
}
