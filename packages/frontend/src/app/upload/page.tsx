"use client";

import { useSession, signIn } from "next-auth/react";
import { LogIn, Lock } from "lucide-react";
import { CVUpload } from "@/components/CVUpload";

export default function UploadPage() {
  const { status } = useSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload CV</h1>
        <p className="text-sm text-gray-600">
          Your CV is private to your account and used to score matches and generate tailored
          applications.
        </p>
      </div>

      {status === "authenticated" ? (
        <CVUpload />
      ) : (
        <div className="glass rounded-2xl p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-brand-600" />
          <p className="mt-2 text-gray-600">Sign in to upload your CV — it’s stored per account.</p>
          <button
            onClick={() => signIn("google")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
          >
            <LogIn className="h-4 w-4" /> Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}
