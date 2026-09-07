"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Mail, CalendarClock, Send, CheckCircle2, AlertTriangle, Sparkles, FileText, Eye, Paperclip } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, StoredCV } from "@/lib/types";
import { cvToPdfBlob, cvToDocxBlob, blobToBase64 } from "@/lib/cvexport";
import { playCoinSound } from "@/lib/sound";

type GenFormat = "pdf" | "docx" | "none";
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
  // Mode: send the uploaded file as-is ("original"), or the AI-tailored text.
  // Defaults to original unless this application was optimised.
  const [useOriginal, setUseOriginal] = useState(!application.optimised);
  const [cvText, setCvText] = useState(application.tailoredCV);
  const isPortal = !application.to; // no email detected = job-portal link

  // The user's uploaded CVs, and which one to send in "original" mode.
  const [cvList, setCvList] = useState<StoredCV[]>([]);
  const [selCvId, setSelCvId] = useState<string | undefined>(cvId);
  const [genFormat, setGenFormat] = useState<GenFormat>("pdf");
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mailto, setMailto] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Load the user's CV list so "My original CV" can offer a picker and know
  // which uploaded file to attach.
  useEffect(() => {
    api
      .getCvs()
      .then((r) => {
        setCvList(r.cvs);
        setSelCvId((cur) => cur ?? cvId ?? r.primaryId ?? r.cvs[r.cvs.length - 1]?.id);
      })
      .catch(() => {});
    if (!name && session?.user?.name) setName(session.user.name);
    if (!email && session?.user?.email) setEmail(session.user.email);
  }, [session, cvId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCv = cvList.find((c) => c.id === selCvId);

  function buildBody(): string {
    const contact = `${name}${email ? ` · ${email}` : ""}${phone ? ` · ${phone}` : ""}`;
    // Inline the CV text only in AI mode with "Body only" chosen.
    const tail = !useOriginal && genFormat === "none" ? `\n\n---\n\n${cvText}` : "";
    return `${coverNote}\n\n— ${contact}${tail}`;
  }

  const pdfAttachment = async () => ({
    name: "CV.pdf",
    type: "application/pdf",
    data: await blobToBase64(cvToPdfBlob(cvText)),
  });

  /** The originally uploaded file for the selected CV. */
  async function loadOriginal() {
    return api.getCvFile(selCvId);
  }

  async function getAttachment() {
    if (useOriginal) return await loadOriginal(); // the uploaded file, unchanged
    if (genFormat === "none") return null;
    if (genFormat === "pdf") return pdfAttachment();
    return { name: "CV.docx", type: DOCX_MIME, data: await blobToBase64(await cvToDocxBlob(cvText)) };
  }

  async function preview() {
    setPreviewing(true);
    setError("");
    setNote("");
    try {
      let blob: Blob;
      if (useOriginal) {
        const f = await loadOriginal();
        blob = new Blob([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], { type: f.type });
      } else if (genFormat === "docx") {
        blob = await cvToDocxBlob(cvText);
      } else {
        blob = cvToPdfBlob(cvText);
      }
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      setError("Couldn’t open that CV. Try re-uploading it on the Upload page.");
    } finally {
      setPreviewing(false);
    }
  }

  async function sendViaGmail() {
    setSending(true);
    setError("");
    try {
      // For the original file, send only its id — the server fetches it (keeps
      // the request small). For generated PDFs/Word, send the base64 inline.
      const attachment = useOriginal ? null : await getAttachment();
      const originalCvId = useOriginal ? selCvId ?? "" : undefined;
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: application.subject, body: buildBody(), attachment, originalCvId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gmail send failed");
      setSent(true);
      playCoinSound();
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

          {/* CV to send */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">CV to send</span>
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-gray-100 p-0.5 text-xs">
                  <button
                    onClick={() => setUseOriginal(true)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${useOriginal ? "bg-white shadow-sm" : "text-gray-500"}`}
                  >
                    <FileText className="h-3 w-3" /> My original CV
                  </button>
                  <button
                    onClick={() => setUseOriginal(false)}
                    disabled={!application.optimised}
                    title={application.optimised ? "" : "Use ✨ AI Apply on the job to tailor your CV first"}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 disabled:opacity-40 ${!useOriginal ? "bg-white shadow-sm" : "text-gray-500"}`}
                  >
                    <Sparkles className="h-3 w-3" /> AI-tailored
                  </button>
                </div>
                <button
                  onClick={preview}
                  disabled={previewing}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <Eye className="h-3.5 w-3.5" /> {previewing ? "Opening…" : "Preview"}
                </button>
              </div>
            </div>

            {useOriginal ? (
              // Send the uploaded file exactly as-is — no editing, no regeneration.
              <div className="space-y-2">
                {cvList.length > 1 && (
                  <select
                    value={selCvId ?? ""}
                    onChange={(e) => setSelCvId(e.target.value)}
                    className="input"
                  >
                    {cvList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fileName}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-2 rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
                  <Paperclip className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="truncate font-medium">
                    {selectedCv?.fileName ?? "Your uploaded CV"}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Your uploaded CV file is attached exactly as-is — nothing is regenerated.
                </p>
              </div>
            ) : (
              // AI-tailored text — editable, then generated to PDF/Word.
              <div className="space-y-2">
                <textarea
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                  rows={10}
                  className="input break-words font-mono text-xs"
                />
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["pdf", "PDF"],
                    ["docx", "Word"],
                    ["none", "Body only"],
                  ] as [GenFormat, string][]).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setGenFormat(v)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        genFormat === v ? "border-brand-600 bg-brand-600 text-white" : "bg-white/60 text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  {genFormat === "none"
                    ? "CV goes in the email body as plain text."
                    : `Generates a ${genFormat.toUpperCase()} from the tailored text above.`}
                </p>
              </div>
            )}
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
