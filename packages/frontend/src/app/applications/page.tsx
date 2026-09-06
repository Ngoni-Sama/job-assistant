"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { Send, CheckCircle2, Clock, Mail, Lock, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";

export default function ApplicationsPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoading(false);
      return;
    }
    api
      .getApplications()
      .then((r) => setApps(r.applications))
      .finally(() => setLoading(false));
  }, [status, authed]);

  if (!authed && status !== "loading") {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-2 text-gray-600">Sign in to track your applications.</p>
        <button onClick={() => signIn("google")} className="mt-3 rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
          Sign in
        </button>
      </div>
    );
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Send className="h-6 w-6 text-brand-600" /> My applications
      </h1>

      {apps.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          Nothing yet. Use <strong>Optimise CV</strong> on a job to prepare an application.
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map((a) => (
            <div key={a.jobId} className="glass rounded-2xl">
              <button
                onClick={() => setOpen(open === a.jobId ? null : a.jobId)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.jobTitle}</p>
                  <p className="truncate text-xs text-gray-500">
                    {a.company} · {new Date(a.generatedAt).toLocaleString()}
                  </p>
                </div>
                <StatusPill app={a} />
              </button>
              {open === a.jobId && (
                <div className="space-y-3 border-t border-white/40 p-4 text-sm">
                  {a.to && (
                    <p className="flex items-center gap-1.5 text-amber-500">
                      <Mail className="h-4 w-4" /> {a.to}
                    </p>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Cover note</p>
                    <p className="whitespace-pre-wrap text-gray-700">{a.coverNote}</p>
                  </div>
                  <details>
                    <summary className="flex cursor-pointer items-center gap-1 text-xs text-brand-700">
                      <FileText className="h-3.5 w-3.5" /> Tailored CV
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">
                      {a.tailoredCV}
                    </pre>
                  </details>
                  <Link href={`/jobs/${encodeURIComponent(a.jobId)}`} className="inline-block text-xs text-brand-700 underline">
                    View job →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ app }: { app: Application }) {
  if (app.sent) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Sent
        {app.sentAt ? ` · ${new Date(app.sentAt).toLocaleDateString()}` : ""}
      </span>
    );
  }
  if (app.method === "manual") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
        <Clock className="h-3.5 w-3.5" /> Send manually
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
      <Clock className="h-3.5 w-3.5" /> Prepared
    </span>
  );
}
