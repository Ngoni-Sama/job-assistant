"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";

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
          onClick={() => signOut()}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
    >
      <LogIn className="h-4 w-4" /> Sign in
    </button>
  );
}
