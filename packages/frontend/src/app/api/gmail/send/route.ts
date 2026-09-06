import { auth } from "@/auth";

type Attachment = { name: string; type: string; data: string }; // data = base64

/**
 * Send an application email from the signed-in user's Gmail via the Gmail API.
 * Supports an optional file attachment (PDF/DOCX/original CV). The access token
 * stays server-side (never sent to the browser or the Worker).
 */
export async function POST(req: Request) {
  const session = await auth();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  const from = session?.user?.email;

  if (!token || !from) {
    return Response.json({ error: "Sign in with Google to send from your Gmail." }, { status: 401 });
  }

  const { to, subject, body, attachment } = (await req.json()) as {
    to?: string;
    subject?: string;
    body?: string;
    attachment?: Attachment | null;
  };
  if (!to) return Response.json({ error: "No recipient email for this job." }, { status: 400 });

  const raw = buildRawMessage(from, to, subject ?? "Job application", body ?? "", attachment);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return Response.json(
      { error: `Gmail send failed (${res.status}). You may need to sign out and back in to grant Gmail access.`, detail },
      { status: 502 },
    );
  }

  return Response.json({ sent: true });
}

/** Build a base64url-encoded RFC 822 message (multipart when an attachment is present). */
function buildRawMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachment?: Attachment | null,
): string {
  let mime: string;
  if (attachment?.data) {
    const boundary = "boundary_" + Math.random().toString(36).slice(2);
    mime = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
      "",
      `--${boundary}`,
      `Content-Type: ${attachment.type || "application/octet-stream"}; name="${attachment.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.name}"`,
      "",
      attachment.data.replace(/(.{76})/g, "$1\r\n"),
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    mime = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n");
  }
  return Buffer.from(mime, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
