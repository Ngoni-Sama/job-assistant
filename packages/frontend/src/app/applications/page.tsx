"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  Send,
  CheckCircle2,
  Clock,
  Mail,
  Lock,
  FileText,
  FileDown,
  Undo2,
  MessageCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";
import { cvToPdfBlob, cvToDocxBlob } from "@/lib/cvexport";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "job";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Filter = "all" | "sent" | "replied";

export default function ApplicationsPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoading(false);
      return;
    }
    api.getApplications().then((r) => setApps(r.applications)).finally(() => setLoading(false));
  }, [status, authed]);

  const patch = (jobId: string, up: Partial<Application>) =>
    setApps((prev) => prev.map((a) => (a.jobId === jobId ? { ...a, ...up } : a)));

  async function unsend(jobId: string) {
    patch(jobId, { sent: false, sentAt: undefined, method: undefined });
    await api.unsendApplication(jobId).catch(() => {});
  }
  async function toggleReplied(a: Application) {
    const next = !a.responded;
    patch(a.jobId, { responded: next });
    await api.markResponded(a.jobId, next).catch(() => {});
  }

  const shown = useMemo(() => {
    if (filter === "sent") return apps.filter((a) => a.sent);
    if (filter === "replied") return apps.filter((a) => a.responded);
    return apps;
  }, [apps, filter]);

  const counts = {
    all: apps.length,
    sent: apps.filter((a) => a.sent).length,
    replied: apps.filter((a) => a.responded).length,
  };

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

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "sent", "replied"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${
              filter === f ? "bg-brand-600 text-white" : "glass text-gray-600"
            }`}
          >
            {f} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          {apps.length === 0 ? (
            <>
              Nothing yet. Use <strong>Optimise CV</strong> on a job to prepare an application.
            </>
          ) : (
            <>No {filter} applications.</>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((a) => (
            <div key={a.jobId} className="glass rounded-2xl">
              <button
                onClick={() => setOpen(open === a.jobId ? null : a.jobId)}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.jobTitle}</p>
                  <p className="truncate text-xs text-gray-500">
                    {a.company} · {new Date(a.generatedAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusPill app={a} />
              </button>
              {open === a.jobId && (
                <div className="space-y-3 border-t border-white/40 p-4 text-sm">
                  {a.to && (
                    <p className="flex items-center gap-1.5 break-all text-amber-500">
                      <Mail className="h-4 w-4 shrink-0" /> {a.to}
                    </p>
                  )}
                  <details>
                    <summary className="flex cursor-pointer items-center gap-1 text-xs text-brand-700">
                      <FileText className="h-3.5 w-3.5" /> Cover note &amp; tailored CV
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-gray-700">{a.coverNote}</p>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-xs text-gray-700">
                      {a.tailoredCV}
                    </pre>
                  </details>

                  {/* Actions — wrap on mobile */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => download(cvToPdfBlob(a.tailoredCV), `CV-${slug(a.jobTitle)}.pdf`)}
                      className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </button>
                    <button
                      onClick={async () => download(await cvToDocxBlob(a.tailoredCV), `CV-${slug(a.jobTitle)}.docx`)}
                      className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Word
                    </button>
                    {a.sent && (
                      <>
                        <button
                          onClick={() => toggleReplied(a)}
                          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${
                            a.responded ? "bg-green-100 text-green-700" : "border text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> {a.responded ? "Replied" : "Mark replied"}
                        </button>
                        <button
                          onClick={() => unsend(a.jobId)}
                          className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Unsend
                        </button>
                      </>
                    )}
                    <Link href={`/jobs/${encodeURIComponent(a.jobId)}`} className="text-xs text-brand-700 underline">
                      View job →
                    </Link>
                  </div>
                  {a.sent && (
                    <p className="text-xs text-gray-400">
                      “Unsend” removes it from tracking — it can’t recall an email already sent.
                    </p>
                  )}
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
  if (app.responded) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
        <MessageCircle className="h-3.5 w-3.5" /> Replied
      </span>
    );
  }
  if (app.sent) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Sent
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
      <Clock className="h-3.5 w-3.5" /> Prepared
    </span>
  );
}
