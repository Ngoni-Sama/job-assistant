"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  Sparkles,
  Upload,
  Trash2,
  Lock,
  Unlock,
  Heart,
  EyeOff,
  FileText,
  Send,
  X,
  Building2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CandidateMatch, RecruiterCv, RecruiterSearchResult, Employer, CandidateCard } from "@/lib/types";

const SECTORS = [
  "IT & Software", "Healthcare", "Engineering", "Finance & Accounting", "Sales & Marketing",
  "Administration", "Education", "Hospitality & Tourism", "Logistics & Transport",
  "NGO & Development", "Human Resources", "Other",
];

const SAMPLE_PROMPTS = [
  "Registered nurse, 3+ years, Harare",
  "Sales & marketing with FMCG experience",
  "Accountant (ACCA / CIMA)",
  "Software developer — React & Node",
  "Driver with a clean class 2 licence",
];

type Turn = { id: number; query: string; loading: boolean; result?: RecruiterSearchResult; error?: string };

export default function RecruiterSearchPage() {
  const { status } = useSession();
  const [employer, setEmployer] = useState<Employer | null | undefined>(undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pool, setPool] = useState<"all" | "platform" | "mine">("all");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [excludeSeen, setExcludeSeen] = useState(true);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());

  const [myCvs, setMyCvs] = useState<RecruiterCv[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      api.getEmployer().then((r) => setEmployer(r.employer)).catch(() => setEmployer(null));
      api.getRecruiterCvs().then((r) => setMyCvs(r.cvs)).catch(() => {});
    } else if (status === "unauthenticated") {
      setEmployer(null);
    }
  }, [status]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function runSearch(q: string) {
    const query = q.trim();
    if (!query) return;
    const id = nextId.current++;
    setTurns((prev) => [...prev, { id, query, loading: true }]);
    setInput("");
    try {
      const excludeIds = excludeSeen ? [...seen] : [];
      const res = await api.recruiterSearch({
        query,
        sector: sector || undefined,
        location: location || undefined,
        pool,
        excludeIds,
        limit: 8,
      });
      setSeen((prev) => {
        const n = new Set(prev);
        res.matches.forEach((m) => n.add(m.id));
        return n;
      });
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, loading: false, result: res } : t)));
    } catch (e) {
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, loading: false, error: (e as Error).message } : t)));
    }
  }

  async function unlock(id: string) {
    try {
      const r = await api.unlockCandidate(id);
      setUnlocked((prev) => ({ ...prev, [id]: r.email }));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function shortlist(m: CandidateMatch) {
    const card: CandidateCard = {
      id: m.id,
      name: m.name,
      headline: m.headline ?? "",
      sector: m.sector ?? "Other",
      availability: "looking",
      location: m.location,
      skills: m.skills,
    };
    try {
      await api.shortlistCandidate(card);
      setShortlisted((prev) => new Set(prev).add(m.id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (employer === undefined) return <p className="text-gray-500">Loading…</p>;
  if (status !== "authenticated") {
    return (
      <Gate>
        <button onClick={() => signIn("google")} className="mt-3 rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
          Sign in with Google
        </button>
      </Gate>
    );
  }
  if (employer?.status !== "approved") {
    return (
      <Gate>
        <p className="mt-1 text-gray-600">
          {employer ? `Your employer account is ${employer.status}.` : "Register an employer account to search talent."}
        </p>
        <Link href="/employers" className="mt-3 inline-block rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
          Go to employer registration
        </Link>
      </Gate>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-brand-600" /> Find talent
          </h1>
          <p className="text-sm text-gray-600">
            Describe the role in plain English — AI ranks the best matching candidates from the platform and your uploads.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 py-2 text-sm text-brand-700 hover:bg-brand-50"
        >
          <Upload className="h-4 w-4" /> Upload CVs ({myCvs.length})
        </button>
      </div>

      {/* Filters */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm">
        <div className="flex overflow-hidden rounded-full border">
          {(["all", "platform", "mine"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPool(p)}
              className={`px-3 py-1.5 text-xs font-medium ${pool === p ? "bg-brand-600 text-white" : "bg-white text-gray-600"}`}
            >
              {p === "all" ? "All CVs" : p === "platform" ? "Platform" : "My uploads"}
            </button>
          ))}
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="input h-9 w-auto py-1 text-xs">
          <option value="">Any sector</option>
          {SECTORS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Any location"
          className="input h-9 w-36 py-1 text-xs"
        />
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={excludeSeen} onChange={(e) => setExcludeSeen(e.target.checked)} />
          Hide candidates I’ve already seen
        </label>
      </div>

      {/* Conversation */}
      <div className="space-y-4">
        {turns.length === 0 && (
          <div className="glass rounded-2xl p-4">
            <p className="mb-2 text-sm font-medium text-gray-700">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => runSearch(p)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-brand-300 hover:bg-brand-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white">{t.query}</div>
            </div>
            {t.loading && <p className="text-sm text-gray-500">Searching candidates…</p>}
            {t.error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t.error}</p>}
            {t.result && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">{t.result.answer}</p>
                {t.result.matches.filter((m) => !hidden.has(m.id)).length === 0 ? (
                  <p className="text-sm text-gray-500">No matching candidates. Try broadening the filters or query.</p>
                ) : (
                  t.result.matches
                    .filter((m) => !hidden.has(m.id))
                    .map((m) => (
                      <MatchCard
                        key={`${t.id}-${m.id}`}
                        m={m}
                        email={unlocked[m.id]}
                        shortlisted={shortlisted.has(m.id)}
                        onUnlock={() => unlock(m.id)}
                        onShortlist={() => shortlist(m)}
                        onHide={() => setHidden((prev) => new Set(prev).add(m.id))}
                      />
                    ))
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-2 flex items-end gap-2 rounded-2xl bg-white/90 p-2 shadow-lg backdrop-blur">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              runSearch(input);
            }
          }}
          rows={1}
          placeholder="e.g. Experienced accountant in Bulawayo with audit background…"
          className="input max-h-28 flex-1 resize-none"
        />
        <button
          onClick={() => runSearch(input)}
          disabled={!input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-600 to-violet-600 text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {showUpload && (
        <UploadModal
          cvs={myCvs}
          onClose={() => setShowUpload(false)}
          onChange={setMyCvs}
        />
      )}
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
      <Building2 className="mx-auto h-8 w-8 text-brand-600" />
      <h1 className="mt-2 text-xl font-bold">Find talent</h1>
      {children}
    </div>
  );
}

function MatchCard({
  m, email, shortlisted, onUnlock, onShortlist, onHide,
}: {
  m: CandidateMatch;
  email?: string;
  shortlisted: boolean;
  onUnlock: () => void;
  onShortlist: () => void;
  onHide: () => void;
}) {
  const pct = Math.round(m.score * 100);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {pct}%
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{m.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.source === "mine" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
              {m.source === "mine" ? "My upload" : "Platform"}
            </span>
          </div>
          {m.headline && <p className="truncate text-sm text-gray-600">{m.headline}</p>}
          <p className="mt-0.5 text-xs text-gray-500">
            {[m.sector, m.location].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <p className="mt-2 text-sm text-gray-700">{m.reason}</p>

      {m.skills && m.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {m.skills.slice(0, 8).map((s) => (
            <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onShortlist}
          disabled={shortlisted}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          <Heart className="h-3.5 w-3.5" /> {shortlisted ? "Shortlisted" : "Shortlist"}
        </button>
        {m.source === "platform" ? (
          email ? (
            <a href={`mailto:${email}`} className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <Unlock className="h-3.5 w-3.5" /> {email}
            </a>
          ) : (
            <button onClick={onUnlock} className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              <Lock className="h-3.5 w-3.5" /> Unlock contact · 20 cr
            </button>
          )
        ) : null}
        <button onClick={onHide} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-gray-400 hover:text-gray-700">
          <EyeOff className="h-3.5 w-3.5" /> Hide
        </button>
      </div>
    </div>
  );
}

function UploadModal({
  cvs, onClose, onChange,
}: {
  cvs: RecruiterCv[];
  onClose: () => void;
  onChange: (cvs: RecruiterCv[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { cv } = await api.uploadRecruiterCv(file, { name, sector, location });
      onChange([...cvs, cv]);
      setFile(null); setName(""); setSector(""); setLocation("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteRecruiterCv(id);
      onChange(cvs.filter((c) => c.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:items-center">
      <div className="glass-strong my-4 w-full max-w-lg rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Your candidate CV pool</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-gray-600">
          Upload CVs (PDF/DOCX) of your own applicants — they become searchable alongside platform candidates.
        </p>

        <div className="space-y-2 rounded-xl border border-dashed border-gray-300 p-3">
          <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="input py-1 text-xs" />
            <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Sector (optional)" className="input py-1 text-xs" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="input py-1 text-xs" />
          </div>
          <button onClick={upload} disabled={!file || busy} className="rounded-full bg-brand-600 px-4 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? "Uploading…" : "Upload CV"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {cvs.length === 0 ? (
            <p className="text-sm text-gray-500">No CVs uploaded yet.</p>
          ) : (
            cvs.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white/60 p-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name || c.fileName}</p>
                  <p className="truncate text-xs text-gray-500">{[c.sector, c.location].filter(Boolean).join(" · ") || c.fileName}</p>
                </div>
                <button onClick={() => remove(c.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
