"use client";

import { useState } from "react";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { cvToPdfBlob, blobToBase64 } from "@/lib/cvexport";

type Job = { role: string; company: string; start: string; end: string; bullets: string };
type Edu = { qualification: string; institution: string; year: string };

const emptyJob = (): Job => ({ role: "", company: "", start: "", end: "", bullets: "" });
const emptyEdu = (): Edu => ({ qualification: "", institution: "", year: "" });

export default function CvBuilderPage() {
  const { status } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [links, setLinks] = useState("");
  const [summary, setSummary] = useState("");
  const [jobs, setJobs] = useState<Job[]>([emptyJob()]);
  const [edus, setEdus] = useState<Edu[]>([emptyEdu()]);
  const [skills, setSkills] = useState("");
  const [languages, setLanguages] = useState("");
  const [certs, setCerts] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function setJob(i: number, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j, idx) => (idx === i ? { ...j, ...patch } : j)));
  }
  function setEdu(i: number, patch: Partial<Edu>) {
    setEdus((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  function buildMarkdown(): string {
    const lines: string[] = [];
    lines.push(`# ${name || "Your Name"}`);
    if (headline) lines.push(headline);
    const contact = [email, phone, location, links].filter(Boolean).join(" · ");
    if (contact) lines.push(contact);
    lines.push("");

    if (summary.trim()) {
      lines.push("## Professional Summary", summary.trim(), "");
    }

    const realJobs = jobs.filter((j) => j.role || j.company);
    if (realJobs.length) {
      lines.push("## Work Experience");
      for (const j of realJobs) {
        const title = [j.role, j.company].filter(Boolean).join(" — ");
        lines.push(`### ${title}`);
        const period = [j.start, j.end].filter(Boolean).join(" – ");
        if (period) lines.push(period);
        for (const b of j.bullets.split("\n").map((s) => s.trim()).filter(Boolean)) {
          lines.push(`- ${b.replace(/^[-*]\s*/, "")}`);
        }
        lines.push("");
      }
    }

    const realEdu = edus.filter((e) => e.qualification || e.institution);
    if (realEdu.length) {
      lines.push("## Education");
      for (const e of realEdu) {
        lines.push(`### ${[e.qualification, e.institution].filter(Boolean).join(" — ")}`);
        if (e.year) lines.push(e.year);
        lines.push("");
      }
    }

    const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillList.length) {
      lines.push("## Skills");
      for (const s of skillList) lines.push(`- ${s}`);
      lines.push("");
    }

    if (languages.trim()) lines.push("## Languages", languages.trim(), "");

    const certList = certs.split("\n").map((s) => s.trim()).filter(Boolean);
    if (certList.length) {
      lines.push("## Certifications");
      for (const c of certList) lines.push(`- ${c}`);
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function preview() {
    const blob = cvToPdfBlob(buildMarkdown());
    window.open(URL.createObjectURL(blob), "_blank");
  }

  async function save() {
    if (status !== "authenticated") return signIn("google");
    if (!name.trim()) {
      setError("Please add your name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const markdown = buildMarkdown();
      const data = await blobToBase64(cvToPdfBlob(markdown));
      const fileName = `${name.trim().replace(/\s+/g, "_")}_CV.pdf`;
      await api.createCv(fileName, markdown, { data, type: "application/pdf" });
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
        <h1 className="mt-2 text-xl font-bold text-green-600">CV created!</h1>
        <p className="mt-1 text-gray-600">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Build your CV</h1>
        <p className="text-sm text-gray-600">
          No CV yet? Fill in a few details and we’ll turn them into a clean, professional CV you can
          apply with right away — and AI-tailor per job later.
        </p>
      </div>

      {/* Personal */}
      <Section icon={<User className="h-4 w-4" />} title="About you">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Full name *" value={name} onChange={setName} placeholder="Jane Doe" />
          <Input label="Professional title" value={headline} onChange={setHeadline} placeholder="Registered Nurse" />
          <Input label="Email" value={email} onChange={setEmail} placeholder="you@email.com" />
          <Input label="Phone" value={phone} onChange={setPhone} placeholder="+263 …" />
          <Input label="Location" value={location} onChange={setLocation} placeholder="Harare, Zimbabwe" />
          <Input label="Links (LinkedIn/portfolio)" value={links} onChange={setLinks} placeholder="linkedin.com/in/…" />
        </div>
        <Area label="Professional summary" value={summary} onChange={setSummary} placeholder="2–3 sentences about who you are and what you do best." />
      </Section>

      {/* Experience */}
      <Section icon={<Briefcase className="h-4 w-4" />} title="Work experience">
        {jobs.map((j, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-gray-200 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Role" value={j.role} onChange={(v) => setJob(i, { role: v })} placeholder="Nurse Aide" />
              <Input label="Company" value={j.company} onChange={(v) => setJob(i, { company: v })} placeholder="Local Clinic" />
              <Input label="Start" value={j.start} onChange={(v) => setJob(i, { start: v })} placeholder="Jan 2022" />
              <Input label="End" value={j.end} onChange={(v) => setJob(i, { end: v })} placeholder="Present" />
            </div>
            <Area
              label="What you did (one per line)"
              value={j.bullets}
              onChange={(v) => setJob(i, { bullets: v })}
              placeholder={"Cared for up to 20 patients per shift\nAssisted doctors during procedures"}
            />
            {jobs.length > 1 && (
              <button onClick={() => setJobs(jobs.filter((_, idx) => idx !== i))} className="flex items-center gap-1 text-xs text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        ))}
        <AddButton label="Add another role" onClick={() => setJobs([...jobs, emptyJob()])} />
      </Section>

      {/* Education */}
      <Section icon={<GraduationCap className="h-4 w-4" />} title="Education">
        {edus.map((e, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-3">
            <Input label="Qualification" value={e.qualification} onChange={(v) => setEdu(i, { qualification: v })} placeholder="Diploma in Nursing" />
            <Input label="Institution" value={e.institution} onChange={(v) => setEdu(i, { institution: v })} placeholder="Harare Poly" />
            <div className="flex items-end gap-2">
              <Input label="Year" value={e.year} onChange={(v) => setEdu(i, { year: v })} placeholder="2021" />
              {edus.length > 1 && (
                <button onClick={() => setEdus(edus.filter((_, idx) => idx !== i))} className="mb-2 text-red-600" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <AddButton label="Add education" onClick={() => setEdus([...edus, emptyEdu()])} />
      </Section>

      {/* Skills */}
      <Section icon={<Wrench className="h-4 w-4" />} title="Skills & more">
        <Input label="Skills (comma-separated)" value={skills} onChange={setSkills} placeholder="Patient care, First aid, Teamwork" />
        <Input label="Languages" value={languages} onChange={setLanguages} placeholder="English, Shona" />
        <Area label="Certifications (one per line, optional)" value={certs} onChange={setCerts} placeholder="First Aid Level 1 — Red Cross" />
      </Section>

      {error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

      <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-2xl bg-white/80 p-2 backdrop-blur">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {saving ? "Creating…" : "Create my CV"}
        </button>
        <button onClick={preview} className="flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
          <Eye className="h-4 w-4" /> Preview PDF
        </button>
      </div>
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

function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="input" />
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
