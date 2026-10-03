import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { workerInternal } from "@/lib/server/worker";

const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

/**
 * Auth.js (NextAuth v5) with Google.
 *
 * Signing in asks only for name, email and photo. Gmail sending (gmail.send,
 * verified by Google 2026-10-03) is requested separately, the first time the
 * user sends from Gmail or turns on Auto-apply — see lib/gmail-permission.ts,
 * which re-runs this same provider with the extra scope. `include_granted_scopes`
 * keeps an earlier Gmail grant on later sign-ins. The access token is kept in
 * the JWT and refreshed when it expires; server routes (app/api/gmail/send)
 * read it from the session.
 *
 * gmail.readonly was removed (2026-10-01): it's a *restricted* scope that would
 * require a paid annual security assessment for verification. Replies are
 * marked manually on the Applications page instead.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: capture tokens from Google.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
        // Did Google grant Gmail sending (now, or earlier via include_granted_scopes)?
        token.gmail = (account.scope ?? "").split(" ").includes(GMAIL_SEND);
        // Auto-apply runs on the server while the user is away, so hand the
        // refresh token to the Worker. It's stored (encrypted) ONLY if this user
        // has auto-apply switched on; otherwise the Worker discards it.
        if (account.refresh_token && token.gmail && token.email) {
          await workerInternal("/api/internal/google-token", {
            userId: token.email,
            refreshToken: account.refresh_token,
          }).catch((err) => console.error("auto-apply token handoff failed", err));
        }
        return token;
      }
      // Still valid (60s buffer).
      if (token.expiresAt && Date.now() < (token.expiresAt as number) - 60_000) {
        return token;
      }
      // Expired — refresh if we can.
      if (token.refreshToken) {
        try {
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.AUTH_GOOGLE_ID!,
              client_secret: process.env.AUTH_GOOGLE_SECRET!,
              grant_type: "refresh_token",
              refresh_token: token.refreshToken as string,
            }),
          });
          const data = (await res.json()) as {
            access_token?: string;
            expires_in?: number;
            refresh_token?: string;
          };
          if (res.ok && data.access_token) {
            token.accessToken = data.access_token;
            token.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
            if (data.refresh_token) token.refreshToken = data.refresh_token;
          }
        } catch (err) {
          console.error("token refresh failed", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session as { accessToken?: string }).accessToken = token.accessToken as string | undefined;
      // Sessions from before this change always had Gmail (it was asked at sign-in).
      const granted = token.gmail === undefined ? !!token.accessToken : !!token.gmail;
      // Usable = granted and either refreshable or the access token is still valid.
      const usable =
        !!token.refreshToken || (!!token.expiresAt && Date.now() < (token.expiresAt as number) - 60_000);
      (session as { gmail?: boolean }).gmail = granted && usable;
      return session;
    },
  },
});
