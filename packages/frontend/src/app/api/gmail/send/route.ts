import { auth } from "@/auth";

/**
 * Send an application email from the signed-in user's Gmail via the Gmail API.
 * The access token stays server-side (read from the session here, never sent to
 * the browser or the Worker).
 */
export async function POST(req: Request) {
  const session = await auth();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  const from = session?.user?.email;

  if (!token || !from) {
    return Response.json({ error: "Sign in with Google to send from your Gmail." }, { status: 401 });
  }

  const { to, subject, body } = (await req.json()) as {
    to?: string;
    subject?: string;
    body?: string;
  };
  if (!to) return Response.json({ error: "No recipient email for this job." }, { status: 400 });

  const raw = buildRawMessage(from, to, subject ?? "Job application", body ?? "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // 403 usually means the gmail.send scope wasn't granted — user must re-consent.
    return Response.json(
      { error: `Gmail send failed (${res.status}). You may need to sign out and back in to grant Gmail access.`, detail },
      { status: 502 },
    );
  }

  return Response.json({ sent: true });
}

/** Build a base64url-encoded RFC 822 message for the Gmail API. */
function buildRawMessage(from: string, to: string, subject: string, body: string): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  const mime = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(mime, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
