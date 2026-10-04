"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";
import { disablePush } from "@/lib/push";

/** Optional Google sign-in. Shows the avatar/name when signed in. */
export function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="h-7 w-16 animate-pulse rounded-md bg-gray-100" />;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        {session.user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        )}
        <span className="hidden max-w-[120px] truncate text-sm text-gray-600 sm:inline">
          {session.user.name ?? session.user.email}
        </span>
        <button
          onClick={async () => {
            // Stop this device getting the account's notifications once signed out.
            await disablePush().catch(() => {});
            await signOut();
          }}
          aria-label="Sign out"
          title="Sign out"
          className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border border-gray-200 px-2.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="flex h-10 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
    >
      <LogIn className="h-4 w-4" /> Sign in
    </button>
  );
}
