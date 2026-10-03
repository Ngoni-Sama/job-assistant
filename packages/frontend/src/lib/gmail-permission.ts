import { signIn } from "next-auth/react";
import type { Session } from "next-auth";

/** Gmail "send on your behalf" — the one Gmail permission VacancyPal uses. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/**
 * Signing in only asks Google for name, email and photo. Gmail sending is
 * asked for separately, the first time someone sends from Gmail or turns on
 * Auto-apply. Google shows its consent screen once; `offline` + `consent`
 * returns a refresh token so sending keeps working (and Auto-apply can run
 * while they're away). Returns to `callbackUrl` afterwards.
 */
export function grantGmail(callbackUrl?: string) {
  return signIn(
    "google",
    { callbackUrl: callbackUrl ?? (typeof window !== "undefined" ? window.location.href : "/") },
    {
      scope: `openid email profile ${GMAIL_SEND_SCOPE}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  );
}

/** Can this session send from Gmail right now? */
export function hasGmail(session: Session | null | undefined): boolean {
  return !!(session as (Session & { gmail?: boolean }) | null)?.gmail;
}
