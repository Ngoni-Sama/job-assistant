import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js (NextAuth v5) with Google. Reads AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 * and AUTH_SECRET from the environment. `trustHost` is required on Vercel and
 * for previews. Sign-in is OPTIONAL — pages work signed-out as the "demo" user;
 * signing in switches API calls to the account's email (see lib/api.ts).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [Google],
});
