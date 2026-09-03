"use client";

import { useState } from "react";
import { X, Mail, Phone, CalendarClock, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, SendResult } from "@/lib/types";

/**
 * Confirmation dialog for a prepared application. Shows the detected recipient,
 * the AI cover note and tailored CV, and asks the user to send or cancel —
 * keeping a human in the loop unless auto-apply is enabled.
 */
export function ApplyModal({
  application,
  onClose,
  onSent,
}: {
  application: Application;
  onClose: () => void;
  onSent: (jobId: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState("");

  async function send() {
    setSending(true);
    setError("");
    try {
      const { result } = await api.sendApplication(application.jobId);
      setResult(result);
      if (result.sent || result.method === "manual") onSent(application.jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Review application — {application.jobTitle}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              {application.to ? (
                <span className="font-medium">{application.to}</span>
              ) : (
                <span className="text-amber-700">No email detected — send manually via “View”.</span>
              )}
            </p>
            {application.phone && (
              <p className="mt-1 flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" /> {application.phone}
              </p>
            )}
            {application.deadline && (
              <p className="mt-1 flex items-center gap-2 text-amber-700">
                <CalendarClock className="h-4 w-4" /> Deadline: {application.deadline}
              </p>
            )}
          </div>

          <Section title="Cover note">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{application.coverNote}</p>
          </Section>

          <Section title="Tailored CV">
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">
              {application.tailoredCV}
            </pre>
          </Section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {result ? (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                result.sent ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {result.sent ? (
                <>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Application sent by email. ✅</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>Auto-send isn’t configured, so nothing was emailed automatically.</p>
                    {result.mailto && (
                      <a href={result.mailto} className="mt-1 inline-block font-medium underline">
                        Open in your email app to send →
                      </a>
                    )}
                    {result.reason && <p className="mt-1 text-xs opacity-80">{result.reason}</p>}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="flex items-center gap-1 rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send application"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      {children}
    </div>
  );
}
