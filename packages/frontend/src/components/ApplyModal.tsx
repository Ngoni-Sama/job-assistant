"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Mail, CalendarClock, Send, CheckCircle2, AlertTriangle, Sparkles, FileText, Eye, Paperclip } from "lucide-react";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";
import { cvToPdfBlob, cvToDocxBlob, blobToBase64 } from "@/lib/cvexport";

type Attach = "none" | "pdf" | "docx" | "original";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Review + edit an application before sending. Everything is editable: recipient,
 * your contact details, the cover note, and the CV text. You can swap the AI-
 * tailored CV for your original one. The content is sent as the email body via
 * your Gmail (it is text, not a PDF/DOCX attachment).
 */
export function ApplyModal({
  application,
  cvId,
  onClose,
  onSent,
}: {
  application: Application;
  /** The CV the user chose to apply with (for the "original" attachment). */
  cvId?: string;
  onClose: () => void;
  onSent: (jobId: string) => void;
}) {
  const { data: session } = useSession();

  const [to, setTo] = useState(application.to ?? "");
  const [name, setName] = useState(session?.user?.name ?? "");
  const [email, setEmail] = useState(session?.user?.email ?? "");
  const [phone, setPhone] = useState(application.phone ?? "");
  const [coverNote, setCoverNote] = useState(application.coverNote);
  // Default to the candidate's OWN CV — the AI rewrite is opt-in.
  const [useOriginal, setUseOriginal] = useState(true);
  const [originalCv, setOriginalCv] = useState<string>("");
  const [cvText, setCvText] = useState(application.tailoredCV);
  const isPortal = !application.to; // no email detected = job-portal link

  const [attach, setAttach] = useState<Attach>("pdf");
  const [originalFile, setOriginalFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mailto, setMailto] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Load the original CV (the default) — AI-tailored is opt-in. When the user
  // picked a specific CV in the radial menu, use that one; else the primary.
  useEffect(() => {
    const source = cvId
      ? api.getCvs().then((r) => r.cvs.find((c) => c.id === cvId)?.markdown ?? "")
      : api.getCV().then((r) => r.cv?.markdown ?? "");
    source
      .then((md) => {
        setOriginalCv(md);
        if (md) setCvText(md); // default view = your own CV
      })
      .catch(() => {});
    if (!name && session?.user?.name) setName(session.user.name);
    if (!email && session?.user?.email) setEmail(session.user.email);
  }, [session, cvId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCv(next: boolean) {
    setUseOriginal(next);
    setCvText(next ? originalCv || application.tailoredCV : application.tailoredCV);
  }

  function buildBody(): string {
    const contact = `${name}${email ? ` · ${email}` : ""}${phone ? ` · ${phone}` : ""}`;
    // When attaching a file, keep the body to the cover note; otherwise inline the CV.
    const tail = attach === "none" ? `\n\n---\n\n${cvText}` : "";
    return `${coverNote}\n\n— ${contact}${tail}`;
  }

  const pdfAttachment = async () => ({
    name: "CV.pdf",
    type: "application/pdf",
    data: await blobToBase64(cvToPdfBlob(cvText)),
  });

  async function loadOriginal() {
    const f = originalFile ?? (await api.getCvFile(cvId));
    if (!originalFile) setOriginalFile(f);
    return f;
  }

  async function getAttachment() {
    if (attach === "none") return null;
    if (attach === "original") {
      try {
        return await loadOriginal();
      } catch {
        setNote("No original CV on file yet (re-upload your CV to enable it) — attached a generated PDF instead.");
        return pdfAttachment();
      }
    }
    if (attach === "pdf") return pdfAttachment();
    return { name: "CV.docx", type: DOCX_MIME, data: await blobToBase64(await cvToDocxBlob(cvText)) };
  }

  async function preview() {
    setPreviewing(true);
    setError("");
    setNote("");
    try {
      let blob: Blob;
      if (attach === "original") {
        try {
          const f = await loadOriginal();
          blob = new Blob([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], { type: f.type });
        } catch {
          setNote("No original CV on file yet — previewing a generated PDF instead.");
          blob = cvToPdfBlob(cvText);
        }
      } else if (attach === "docx") {
        blob = await cvToDocxBlob(cvText);
      } else {
        blob = cvToPdfBlob(cvText);
      }
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function sendViaGmail() {
    setSending(true);
    setError("");
    try {
      const attachment = await getAttachment();
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: application.subject, body: buildBody(), attachment }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gmail send failed");
      setSent(true);
      onSent(application.jobId);
    } catch (e) {
      setError((e as Error).message);
      setMailto(
        `mailto:${to}?subject=${encodeURIComponent(application.subject)}&body=${encodeURIComponent(buildBody())}`,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:items-center sm:p-4">
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between rounded-t-2xl border-b bg-white p-4">
          <h2 className="truncate font-semibold">Review &amp; send — {application.jobTitle}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {application.deadline && (
            <p className="flex items-center gap-1.5 text-sm text-amber-700">
              <CalendarClock className="h-4 w-4" /> Deadline: {application.deadline}
            </p>
          )}

          {isPortal && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No application email was found — this looks like a <strong>job-portal link</strong>. You’ll
                likely need to <strong>apply on their site</strong>. Download your CV below, then use{" "}
                <strong>Source</strong> on the job to apply directly. (If you do know the email, enter it above.)
              </span>
            </div>
          )}

          {/* Recipient + your contact */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Send to (employer email)">
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Not detected — enter it" className="input" />
            </Field>
            <Field label="Your name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </Field>
            <Field label="Your email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </Field>
            <Field label="Your phone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Add your number" className="input" />
            </Field>
          </div>

          <Field label="Cover note (editable)">
            <textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={5} className="input" />
          </Field>

          {/* CV toggle */}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">CV (editable)</span>
              <div className="flex rounded-full bg-gray-100 p-0.5 text-xs">
                <button
                  onClick={() => toggleCv(false)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${!useOriginal ? "bg-white shadow-sm" : "text-gray-500"}`}
                >
                  <Sparkles className="h-3 w-3" /> AI-tailored
                </button>
                <button
                  onClick={() => toggleCv(true)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${useOriginal ? "bg-white shadow-sm" : "text-gray-500"}`}
                >
                  <FileText className="h-3 w-3" /> My original CV
                </button>
              </div>
            </div>
            <textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              rows={10}
              className="input break-words font-mono text-xs"
            />
          </div>

          {/* Attachment format */}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Paperclip className="h-3.5 w-3.5" /> Attach CV as
              </span>
              <button
                onClick={preview}
                disabled={previewing || attach === "none"}
                className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <Eye className="h-3.5 w-3.5" /> {previewing ? "Opening…" : "Preview"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["pdf", "PDF"],
                ["docx", "Word"],
                ["original", "My original CV"],
                ["none", "Body only"],
              ] as [Attach, string][]).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setAttach(v)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    attach === v ? "border-brand-600 bg-brand-600 text-white" : "bg-white/60 text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {attach === "none"
                ? "CV goes in the email body as plain text."
                : attach === "original"
                  ? "Sends your originally uploaded CV file, unchanged."
                  : `Generates a ${attach.toUpperCase()} from the CV above and attaches it.`}
            </p>
          </div>

          {note && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{note}</div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{error}</p>
                {mailto && (
                  <a href={mailto} className="mt-1 inline-block font-medium underline">
                    Open in your email app instead →
                  </a>
                )}
              </div>
            </div>
          )}

          {sent ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Application sent from your Gmail ✅
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={sendViaGmail}
                disabled={sending || !to.trim()}
                className="flex items-center gap-1 rounded-md bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {to.trim() ? <Mail className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : "Send from my Gmail"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}
