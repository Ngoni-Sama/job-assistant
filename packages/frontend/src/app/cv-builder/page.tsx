"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import {
  Sparkles,
  Plus,
  Trash2,
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  Check,
  Eye,
  Target,
  Gauge,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Save,
  Undo2,
  Coins,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cvToPdfBlob, cvToDocxBlob, blobToBase64 } from "@/lib/cvexport";
import { scoreCv, type AtsReport } from "@/lib/atsScore";
import { useCosts } from "@/lib/useCosts";

type Job = { role: string; company: string; start: string; end: string; bullets: string };
type Edu = { qualification: string; institution: string; year: string };

const emptyJob = (): Job => ({ role: "", company: "", start: "", end: "", bullets: "" });
const emptyEdu = (): Edu => ({ qualification: "", institution: "", year: "" });

const DRAFT_KEY = "cvbuilder:draft"; // unsaved CV kept on this device

type Draft = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string;
  summary: string;
  jobs: Job[];
  edus: Edu[];
  skills: string;
  languages: string;
  certs: string;
  targetRole: string;
  advert: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: "",
  summary: "",
  jobs: [emptyJob()],
  edus: [emptyEdu()],
  skills: "",
  languages: "",
  certs: "",
  targetRole: "",
  advert: "",
});

const splitSkills = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function CvBuilderPage() {
  const { data: session, status } = useSession();
  const authed = status === "authenticated";
  const router = useRouter();
  const costs = useCosts();

  const [d, setD] = useState<Draft>(emptyDraft);
  const [restored, setRestored] = useState(false);

  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [needCredits, setNeedCredits] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [undo, setUndo] = useState<Draft | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const setJob = (i: number, patch: Partial<Job>) =>
    setD((prev) => ({ ...prev, jobs: prev.jobs.map((j, idx) => (idx === i ? { ...j, ...patch } : j)) }));
  const setEdu = (i: number, patch: Partial<Edu>) =>
    setD((prev) => ({ ...prev, edus: prev.edus.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) }));

  // Restore the draft from this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
      if (saved) setD((prev) => ({ ...prev, ...saved }));
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);

  // Keep the draft as they type (only after restoring, so the empty form never overwrites it).
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d, restored]);

  // Signed in: fill the blanks from their profile.
  useEffect(() => {
    if (!authed) return;
    api
      .getProfile()
      .then(({ profile: p }) =>
        setD((prev) => ({
          ...prev,
          name: prev.name || p.name || session?.user?.name || "",
          email: prev.email || session?.user?.email || "",
          headline: prev.headline || p.headline || "",
          location: prev.location || p.location || "",
          skills: prev.skills || (p.skills ?? []).join(", "),
          languages: prev.languages || (p.languages ?? []).join(", "),
          targetRole: prev.targetRole || p.mainProfession || "",
        })),
      )
      .catch(() => {});
  }, [authed, session?.user?.name, session?.user?.email]);

  const report: AtsReport = useMemo(
    () =>
      scoreCv(
        {
          name: d.name,
          headline: d.headline,
          email: d.email,
          phone: d.phone,
          location: d.location,
          summary: d.summary,
          jobs: d.jobs,
          edus: d.edus,
          skills: splitSkills(d.skills),
          certs: splitLines(d.certs),
        },
        d.advert,
      ),
    [d],
  );

  function buildMarkdown(): string {
    const lines: string[] = [];
    lines.push(`# ${d.name || "Your Name"}`);
    if (d.headline) lines.push(d.headline);
    const contact = [d.email, d.phone, d.location, d.links].filter(Boolean).join(" · ");
    if (contact) lines.push(contact);
    lines.push("");

    if (d.summary.trim()) lines.push("## Professional Summary", d.summary.trim(), "");

    const realJobs = d.jobs.filter((j) => j.role || j.company);
    if (realJobs.length) {
      lines.push("## Work Experience");
      for (const j of realJobs) {
        lines.push(`### ${[j.role, j.company].filter(Boolean).join(" — ")}`);
        const period = [j.start, j.end].filter(Boolean).join(" – ");
        if (period) lines.push(period);
        for (const b of splitLines(j.bullets)) lines.push(`- ${b.replace(/^[-*•]\s*/, "")}`);
        lines.push("");
      }
    }

    const realEdu = d.edus.filter((e) => e.qualification || e.institution);
    if (realEdu.length) {
      lines.push("## Education");
      for (const e of realEdu) {
        lines.push(`### ${[e.qualification, e.institution].filter(Boolean).join(" — ")}`);
        if (e.year) lines.push(e.year);
        lines.push("");
      }
    }

    const skillList = splitSkills(d.skills);
    if (skillList.length) {
      lines.push("## Skills");
      for (const s of skillList) lines.push(`- ${s}`);
      lines.push("");
    }

    if (d.languages.trim()) lines.push("## Languages", d.languages.trim(), "");

    const certList = splitLines(d.certs);
    if (certList.length) {
      lines.push("## Certifications");
      for (const c of certList) lines.push(`- ${c}`);
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const fileBase = () => `${(d.name.trim() || "My").replace(/\s+/g, "_")}_CV`;

  function preview() {
    window.open(URL.createObjectURL(cvToPdfBlob(buildMarkdown())), "_blank");
  }

  async function downloadWord() {
    const url = URL.createObjectURL(await cvToDocxBlob(buildMarkdown()));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase()}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Paid: AI rewrites the headline, summary, bullets and skill order from their own facts. */
  async function writeWithAi() {
    if (!authed) return signIn("google");
    const idx = d.jobs.map((j, i) => (j.role.trim() || j.company.trim() ? i : -1)).filter((i) => i >= 0);
    if (!idx.length && !d.summary.trim() && !splitSkills(d.skills).length) {
      setError("Add at least one role (with what you did), a summary or some skills first — the AI only uses your own details.");
      return;
    }
    setWriting(true);
    setError("");
    setNeedCredits(false);
    setAiNote("");
    try {
      const { cv } = await api.atsWriteCv({
        targetRole: d.targetRole,
        jobDescription: d.advert,
        headline: d.headline,
        summary: d.summary,
        experience: idx.map((i) => ({
          role: d.jobs[i].role,
          company: d.jobs[i].company,
          start: d.jobs[i].start,
          end: d.jobs[i].end,
          details: d.jobs[i].bullets,
        })),
        education: d.edus
          .filter((e) => e.qualification || e.institution)
          .map((e) => ({ qualification: e.qualification, institution: e.institution, year: e.year })),
        skills: splitSkills(d.skills),
        certifications: splitLines(d.certs),
        languages: d.languages,
      });
      setUndo(d);
      setD((prev) => {
        const jobs = prev.jobs.map((j) => ({ ...j }));
        idx.forEach((jobIndex, k) => {
          const bullets = cv.experience[k]?.bullets ?? [];
          if (bullets.length) jobs[jobIndex].bullets = bullets.join("\n");
        });
        return {
          ...prev,
          headline: cv.headline || prev.headline,
          summary: cv.summary || prev.summary,
          skills: cv.skills.length ? cv.skills.join(", ") : prev.skills,
          jobs,
        };
      });
      setAiNote(
        cv.removed
          ? `Done — your CV has been rewritten. We removed ${cv.removed} AI suggestion${cv.removed === 1 ? "" : "s"} that weren’t backed by your details. Review it, then save or download.`
          : "Done — your CV has been rewritten. Review it, then save or download.",
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (/not enough credits/i.test(msg)) setNeedCredits(true);
      else setError(msg);
    } finally {
      setWriting(false);
    }
  }

  async function save() {
    if (!authed) return signIn("google");
    if (!d.name.trim()) {
      setError("Please add your name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const markdown = buildMarkdown();
      const data = await blobToBase64(cvToPdfBlob(markdown));
      await api.createCv(`${fileBase()}.pdf`, markdown, { data, type: "application/pdf" });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Check className="mx-auto h-10 w-10 text-green-500" />
        <h1 className="mt-2 text-xl font-bold text-green-600">CV saved!</h1>
        <p className="mt-1 text-gray-600">It’s in My CVs — taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="glass-strong rounded-3xl p-6 md:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
          <ShieldCheck className="h-3.5 w-3.5" /> ATS-friendly CV Creator
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Get shortlisted, not filtered out.</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Most big employers screen CVs with software before a person reads them. Fill in your details, check your
          free ATS score as you type, and let AI turn them into a clean, keyword-matched CV — in plain text the
          screening systems can actually read.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Free ATS score
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> PDF &amp; Word with real, selectable text
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> AI never invents jobs, numbers or skills
          </li>
        </ul>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Target */}
          <Section icon={<Target className="h-4 w-4" />} title="The job you want (optional, but boosts your score)">
            <Input label="Target job title" value={d.targetRole} onChange={(v) => set("targetRole", v)} placeholder="Accountant" />
            <Area
              label="Paste the job advert"
              value={d.advert}
              onChange={(v) => set("advert", v)}
              rows={4}
              placeholder="Paste the advert here — we’ll show which of its keywords your CV covers, and the AI will use its wording where it truthfully fits you."
            />
          </Section>

          {/* Personal */}
          <Section icon={<User className="h-4 w-4" />} title="About you">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Full name *" value={d.name} onChange={(v) => set("name", v)} placeholder="Jane Doe" />
              <Input label="Professional title" value={d.headline} onChange={(v) => set("headline", v)} placeholder="Registered Nurse" />
              <Input label="Email" value={d.email} onChange={(v) => set("email", v)} placeholder="you@email.com" />
              <Input label="Phone" value={d.phone} onChange={(v) => set("phone", v)} placeholder="+263 …" />
              <Input label="Location" value={d.location} onChange={(v) => set("location", v)} placeholder="Harare, Zimbabwe" />
              <Input label="Links (LinkedIn/portfolio)" value={d.links} onChange={(v) => set("links", v)} placeholder="linkedin.com/in/…" />
            </div>
            <Area label="Professional summary" value={d.summary} onChange={(v) => set("summary", v)} placeholder="2–3 sentences about who you are and what you do best." />
          </Section>

          {/* Experience */}
          <Section icon={<Briefcase className="h-4 w-4" />} title="Work experience">
            {d.jobs.map((j, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-gray-200 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Role" value={j.role} onChange={(v) => setJob(i, { role: v })} placeholder="Nurse Aide" />
                  <Input label="Company" value={j.company} onChange={(v) => setJob(i, { company: v })} placeholder="Local Clinic" />
                  <Input label="Start" value={j.start} onChange={(v) => setJob(i, { start: v })} placeholder="Jan 2022" />
                  <Input label="End" value={j.end} onChange={(v) => setJob(i, { end: v })} placeholder="Present" />
                </div>
                <Area
                  label="What you did (one per line — rough notes are fine, the AI will polish them)"
                  value={j.bullets}
                  onChange={(v) => setJob(i, { bullets: v })}
                  rows={4}
                  placeholder={"Cared for up to 20 patients per shift\nAssisted doctors during procedures"}
                />
                {d.jobs.length > 1 && (
                  <button
                    onClick={() => set("jobs", d.jobs.filter((_, idx) => idx !== i))}
                    className="flex items-center gap-1 text-xs text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            ))}
            <AddButton label="Add another role" onClick={() => set("jobs", [...d.jobs, emptyJob()])} />
          </Section>

          {/* Education */}
          <Section icon={<GraduationCap className="h-4 w-4" />} title="Education">
            {d.edus.map((e, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-3">
                <Input label="Qualification" value={e.qualification} onChange={(v) => setEdu(i, { qualification: v })} placeholder="Diploma in Nursing" />
                <Input label="Institution" value={e.institution} onChange={(v) => setEdu(i, { institution: v })} placeholder="Harare Poly" />
                <div className="flex items-end gap-2">
                  <Input label="Year" value={e.year} onChange={(v) => setEdu(i, { year: v })} placeholder="2021" />
                  {d.edus.length > 1 && (
                    <button onClick={() => set("edus", d.edus.filter((_, idx) => idx !== i))} className="mb-2 text-red-600" title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <AddButton label="Add education" onClick={() => set("edus", [...d.edus, emptyEdu()])} />
          </Section>

          {/* Skills */}
          <Section icon={<Wrench className="h-4 w-4" />} title="Skills & more">
            <Input label="Skills (comma-separated)" value={d.skills} onChange={(v) => set("skills", v)} placeholder="Patient care, First aid, Teamwork" />
            <Input label="Languages" value={d.languages} onChange={(v) => set("languages", v)} placeholder="English, Shona" />
            <Area label="Certifications (one per line, optional)" value={d.certs} onChange={(v) => set("certs", v)} placeholder="First Aid Level 1 — Red Cross" />
          </Section>
        </div>

        {/* Score + actions */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <ScorePanel report={report} />

          <div className="glass space-y-3 rounded-2xl p-4">
            <button
              onClick={writeWithAi}
              disabled={writing}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {writing ? "Writing your CV…" : "Write my CV with AI"}
              {!writing && (
                <span className="flex items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  <Coins className="h-3 w-3" /> {costs.atsCv}
                </span>
              )}
            </button>
            <p className="text-center text-xs text-gray-500">
              Uses only what you’ve entered. You’re not charged if it fails.
            </p>

            {aiNote && (
              <div className="space-y-2 rounded-xl bg-green-50/80 p-3 text-sm text-green-800">
                <p>{aiNote}</p>
                {undo && (
                  <button
                    onClick={() => {
                      setD(undo);
                      setUndo(null);
                      setAiNote("");
                    }}
                    className="flex items-center gap-1 text-xs font-medium underline"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Undo AI changes
                  </button>
                )}
              </div>
            )}
            {needCredits && (
              <div className="rounded-xl bg-amber-50/90 p-3 text-sm text-amber-800">
                You need {costs.atsCv} credits to write your CV with AI.{" "}
                <Link href="/billing" className="font-medium underline">
                  Top up credits
                </Link>{" "}
                — your ATS score and downloads stay free.
              </div>
            )}
            {error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={preview} className="flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm text-gray-700 hover:bg-white">
                <Eye className="h-4 w-4" /> PDF
              </button>
              <button onClick={downloadWord} className="flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm text-gray-700 hover:bg-white">
                <FileDown className="h-4 w-4" /> Word
              </button>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save to My CVs & apply"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScorePanel({ report }: { report: AtsReport }) {
  const { score, checks, keywords } = report;
  const colour = score >= 80 ? "text-green-600" : score >= 55 ? "text-amber-500" : "text-red-500";
  const label = score >= 80 ? "Strong" : score >= 55 ? "Getting there" : "Needs work";
  const r = 34;
  const c = 2 * Math.PI * r;
  // Biggest gains first.
  const todo = checks.filter((ch) => ch.points < ch.max).sort((a, b) => b.max - b.points - (a.max - a.points));
  const passed = checks.filter((ch) => ch.points >= ch.max);
  return (
    <div className="glass space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-200" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - score / 100)}
            className={`${colour} transition-all duration-500`}
          />
        </svg>
        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Gauge className="h-3.5 w-3.5" /> ATS score · free
          </p>
          <p className={`text-3xl font-extrabold ${colour}`}>{score}</p>
          <p className="text-sm text-gray-600">{label}</p>
        </div>
      </div>

      {keywords && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Advert keywords · {keywords.matched.length}/{keywords.matched.length + keywords.missing.length}
          </p>
          <div className="flex flex-wrap gap-1">
            {keywords.matched.map((k) => (
              <span key={k} className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                {k}
              </span>
            ))}
            {keywords.missing.map((k) => (
              <span key={k} className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 line-through decoration-red-300">
                {k}
              </span>
            ))}
          </div>
          {keywords.missing.length > 0 && (
            <p className="text-xs text-gray-500">Missing words only help if they’re true for you — never add skills you don’t have.</p>
          )}
        </div>
      )}

      {todo.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">To improve</p>
          <ul className="space-y-2 text-sm">
            {todo.slice(0, 4).map((ch) => (
              <li key={ch.id} className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="min-w-0">
                  <span className="text-gray-800">{ch.label}</span>
                  {ch.tip && <span className="block text-xs text-gray-500">{ch.tip}</span>}
                </span>
              </li>
            ))}
          </ul>
          {todo.length > 4 && <p className="text-xs text-gray-500">+{todo.length - 4} more — fix these first.</p>}
        </div>
      )}
      {passed.length > 0 && (
        <details className="text-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" /> {passed.length} of {checks.length} checks passed
          </summary>
          <ul className="mt-2 space-y-1 pl-6 text-xs text-gray-600">
            {passed.map((ch) => (
              <li key={ch.id}>{ch.label}</li>
            ))}
          </ul>
        </details>
      )}
      {todo.length === 0 && <p className="text-sm font-medium text-green-700">Everything checks out — save it and start applying.</p>}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="glass space-y-3 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 font-semibold text-brand-700">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="input" />
    </label>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}
