import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

/**
 * Auth.js (NextAuth v5) with Google + Gmail send.
 *
 * We request the gmail.send scope so the app can send applications from the
 * user's own Gmail. The access token is kept in the JWT and refreshed when it
 * expires; it's exposed on the session so server routes (app/api/gmail/send)
 * can use it. NOTE: gmail.send is a *sensitive* scope — Google caps it at 100
 * users until the consent screen is verified.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_SEND}`,
          access_type: "offline",
          prompt: "consent",
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
      return session;
    },
  },
});
