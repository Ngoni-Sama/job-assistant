import { auth } from "@/auth";

type Attachment = { name: string; type: string; data: string }; // data = base64

const WORKER_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://job-assistant.ma360-ngoni.workers.dev")
  .trim()
  .replace(/\/+$/, "");

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

  const { to, subject, body, attachment, originalCvId } = (await req.json()) as {
    to?: string;
    subject?: string;
    body?: string;
    attachment?: Attachment | null;
    // When set (id string, or "" for the primary CV), fetch the original file
    // server-side instead of the browser uploading its base64 (avoids the
    // platform request-size limit for large uploaded CVs).
    originalCvId?: string;
  };
  if (!to) return Response.json({ error: "No recipient email for this job." }, { status: 400 });

  let att = attachment ?? null;
  if (!att && originalCvId !== undefined) {
    try {
      const q = originalCvId ? `?id=${encodeURIComponent(originalCvId)}` : "";
      const r = await fetch(`${WORKER_BASE}/api/cv-file${q}`, { headers: { "x-user-id": from } });
      if (r.ok) att = (await r.json()) as Attachment;
      else return Response.json({ error: "Couldn’t load your uploaded CV to attach it." }, { status: 502 });
    } catch {
      return Response.json({ error: "Couldn’t reach the CV store to attach your original CV." }, { status: 502 });
    }
  }

  const raw = buildRawMessage(from, to, subject ?? "Job application", body ?? "", att);

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
