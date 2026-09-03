import type { Application, Env } from "../types";

export interface SendResult {
  sent: boolean;
  method: "email" | "manual";
  mailto?: string; // provided when we couldn't send for the user to send manually
  reason?: string;
}

/**
 * Send a prepared application by email.
 *
 * Real sending is OFF by default and only happens when a provider is configured
 * (RESEND_API_KEY + APPLY_FROM_EMAIL). Otherwise we return a `mailto:` link so
 * the user sends it themselves — deliberately keeping a human in the loop for
 * outbound messages to real employers.
 */
export async function sendApplication(app: Application, env: Env): Promise<SendResult> {
  if (!app.to) {
    return { sent: false, method: "manual", reason: "No application email detected on this job." };
  }

  const body = `${app.coverNote}\n\n---\n\n${app.tailoredCV}`;

  if (!env.RESEND_API_KEY || !env.APPLY_FROM_EMAIL) {
    return { sent: false, method: "manual", mailto: buildMailto(app.to, app.subject, body) };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.APPLY_FROM_EMAIL,
        to: app.to,
        subject: app.subject,
        text: body,
      }),
    });
    if (!res.ok) {
      return {
        sent: false,
        method: "manual",
        mailto: buildMailto(app.to, app.subject, body),
        reason: `Provider returned ${res.status}`,
      };
    }
    return { sent: true, method: "email" };
  } catch (err) {
    return {
      sent: false,
      method: "manual",
      mailto: buildMailto(app.to, app.subject, body),
      reason: (err as Error).message,
    };
  }
}

function buildMailto(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
