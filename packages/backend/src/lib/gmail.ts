import type { Env } from "../types";

/** Server-side Gmail sending for auto-apply (the user isn't present). */

export class GoogleAuthRevoked extends Error {}

/** Exchange a stored refresh token for a short-lived access token. */
export async function getAccessToken(env: Env, refreshToken: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET Worker secrets are not set");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (data.error === "invalid_grant") throw new GoogleAuthRevoked("Google access was revoked or expired");
  if (!res.ok || !data.access_token) throw new Error(`Google token refresh failed (${res.status} ${data.error ?? ""})`);
  return data.access_token;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const utf8b64 = (s: string) => b64(new TextEncoder().encode(s));
/** RFC 2047 header encoding so non-ASCII subjects/names survive. */
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`);
const wrap76 = (s: string) => s.replace(/(.{76})/g, "$1\r\n");

export interface MailAttachment {
  name: string;
  type: string;
  data: string; // base64
}

/** Send an email from the authenticated user's Gmail. */
export async function sendGmail(
  accessToken: string,
  msg: { from: string; to: string; subject: string; body: string; attachment?: MailAttachment | null },
): Promise<void> {
  const head = [`From: ${msg.from}`, `To: ${msg.to}`, `Subject: ${encodeHeader(msg.subject)}`, "MIME-Version: 1.0"];
  let mime: string;
  if (msg.attachment?.data) {
    const boundary = "vp_" + crypto.randomUUID().replace(/-/g, "");
    mime = [
      ...head,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(utf8b64(msg.body)),
      "",
      `--${boundary}`,
      `Content-Type: ${msg.attachment.type || "application/octet-stream"}; name="${encodeHeader(msg.attachment.name)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodeHeader(msg.attachment.name)}"`,
      "",
      wrap76(msg.attachment.data.replace(/\s+/g, "")),
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    mime = [...head, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(utf8b64(msg.body))].join("\r\n");
  }
  const raw = utf8b64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (res.status === 401) throw new GoogleAuthRevoked("Gmail rejected the access token");
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
