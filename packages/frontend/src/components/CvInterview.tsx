"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Coins,
  GraduationCap,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCosts } from "@/lib/useCosts";

export type InterviewJob = { role: string; company: string; start: string; end: string; bullets: string };
export type InterviewEdu = { qualification: string; institution: string; year: string };
export type InterviewResult = { targetRole: string; jobs: InterviewJob[]; edus: InterviewEdu[]; skills: string[] };

type Role = InterviewJob & {
  questions: string[];
  answers: string[];
  suggested: string[];
  asked: boolean;
};

const emptyRole = (): Role => ({
  role: "",
  company: "",
  start: "",
  end: "",
  bullets: "",
  questions: [],
  answers: [],
  suggested: [],
  asked: false,
});

type Step = "target" | "role" | "questions" | "more" | "education" | "done";

/**
 * A guided interview that builds the CV with the person: what job they want,
 * each job they've done in their own words, AI follow-up questions that draw out
 * achievements and numbers, skills to tick, then education. Answers go into the
 * CV form as facts — the AI writer only polishes what they said.
 */
export function CvInterview({
  initialTarget,
  onClose,
  onDone,
}: {
  initialTarget: string;
  onClose: () => void;
  onDone: (r: InterviewResult) => void;
}) {
  const { status } = useSession();
  const costs = useCosts();
  const [step, setStep] = useState<Step>("target");
  const [target, setTarget] = useState(initialTarget);
  const [roles, setRoles] = useState<Role[]>([emptyRole()]);
  const [current, setCurrent] = useState(0);
  const [skills, setSkills] = useState<string[]>([]);
  const [edus, setEdus] = useState<InterviewEdu[]>([{ qualification: "", institution: "", year: "" }]);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  const role = roles[current];
  const setRole = (patch: Partial<Role>) =>
    setRoles((prev) => prev.map((r, i) => (i === current ? { ...r, ...patch } : r)));

  async function askQuestions() {
    if (!role.role.trim()) {
      setNote("Add the job title first.");
      return;
    }
    setNote("");
    if (status !== "authenticated") {
      // Questions need an account (they use AI); they can still carry on without them.
      setNote("Sign in to get AI questions — or press “Skip” to carry on without them.");
      return;
    }
    setAsking(true);
    try {
      const r = await api.cvQuestions({ targetRole: target, role: role.role, company: role.company, details: role.bullets });
      setRole({ questions: r.questions, answers: r.questions.map(() => ""), suggested: r.skills, asked: true });
      setStep("questions");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  function toggleSkill(s: string) {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function finish() {
    // Each answered question becomes a fact line under that job ("question: answer").
    const jobs = roles
      .filter((r) => r.role.trim() || r.company.trim())
      .map((r) => {
        const facts = r.questions
          .map((q, i) => ({ q: q.replace(/\?+$/, "").trim(), a: (r.answers[i] ?? "").trim() }))
          .filter((x) => x.a)
          .map((x) => `${x.q}: ${x.a}`);
        return {
          role: r.role.trim(),
          company: r.company.trim(),
          start: r.start.trim(),
          end: r.end.trim(),
          bullets: [r.bullets.trim(), ...facts].filter(Boolean).join("\n"),
        };
      });
    onDone({
      targetRole: target.trim(),
      jobs,
      edus: edus.filter((e) => e.qualification.trim() || e.institution.trim()),
      skills,
    });
  }

  const steps: Step[] = ["target", "role", "questions", "more", "education", "done"];
  const progress = Math.round(((steps.indexOf(step) + 1) / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="CV interview">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
            <MessageCircleQuestion className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">CV interview</p>
            <p className="text-xs text-gray-500">Answer in your own words — we turn it into your CV.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-gradient-to-r from-brand-500 to-accent-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {step === "target" && (
            <>
              <Question icon={<Target className="h-5 w-5" />} title="What job are you going for?">
                We’ll shape your CV around it.
              </Question>
              <input autoFocus value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Accountant, Nurse, Driver" className="input" />
            </>
          )}

          {step === "role" && (
            <>
              <Question icon={<Briefcase className="h-5 w-5" />} title={current === 0 ? "Tell us about your most recent job" : "Tell us about another job"}>
                Include jobs, internships, attachments, volunteering or running your own business.
              </Question>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" value={role.role} onChange={(v) => setRole({ role: v })} placeholder="Accounts Clerk" autoFocus />
                <Field label="Where" value={role.company} onChange={(v) => setRole({ company: v })} placeholder="Delta Beverages" />
                <Field label="From" value={role.start} onChange={(v) => setRole({ start: v })} placeholder="Jan 2022" />
                <Field label="To" value={role.end} onChange={(v) => setRole({ end: v })} placeholder="Present" />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-gray-500">What did you do there? Write it however you like.</span>
                <textarea
                  value={role.bullets}
                  onChange={(e) => setRole({ bullets: e.target.value })}
                  rows={4}
                  className="input"
                  placeholder={"I did the invoices and supplier payments, helped with month end, and trained two new clerks…"}
                />
              </label>
            </>
          )}

          {step === "questions" && (
            <>
              <Question icon={<Sparkles className="h-5 w-5" />} title={`A few questions about ${role.role || "this job"}`}>
                Answer what you can in a line — skip any that don’t apply. Only say what’s true; employers check.
              </Question>
              {role.questions.map((q, i) => (
                <label key={i} className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-800">{q}</span>
                  <input
                    value={role.answers[i] ?? ""}
                    onChange={(e) => setRole({ answers: role.answers.map((a, k) => (k === i ? e.target.value : a)) })}
                    className="input"
                    placeholder="Your answer (optional)"
                  />
                </label>
              ))}
              {role.suggested.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-800">Which of these skills do you have? Tick only the true ones.</p>
                  <div className="flex flex-wrap gap-2">
                    {role.suggested.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSkill(s)}
                        aria-pressed={skills.includes(s)}
                        className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors ${
                          skills.includes(s) ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-brand-300"
                        }`}
                      >
                        {skills.includes(s) && <Check className="h-3.5 w-3.5" />} {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === "more" && (
            <>
              <Question icon={<Briefcase className="h-5 w-5" />} title="Any other jobs to add?">
                {roles.filter((r) => r.role.trim()).length} added so far:{" "}
                {roles
                  .filter((r) => r.role.trim())
                  .map((r) => r.role)
                  .join(", ")}
              </Question>
              <button
                onClick={() => {
                  setRoles((prev) => [...prev, emptyRole()]);
                  setCurrent(roles.length);
                  setStep("role");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-300 px-4 py-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                <Plus className="h-4 w-4" /> Add another job
              </button>
            </>
          )}

          {step === "education" && (
            <>
              <Question icon={<GraduationCap className="h-5 w-5" />} title="What’s your highest qualification?">
                Degree, diploma, certificate, or O/A-Levels.
              </Question>
              {edus.map((e, i) => (
                <div key={i} className="grid gap-3 rounded-2xl border border-gray-100 p-3 sm:grid-cols-3">
                  <Field label="Qualification" value={e.qualification} onChange={(v) => setEdus((p) => p.map((x, k) => (k === i ? { ...x, qualification: v } : x)))} placeholder="BCom Accounting" />
                  <Field label="Where" value={e.institution} onChange={(v) => setEdus((p) => p.map((x, k) => (k === i ? { ...x, institution: v } : x)))} placeholder="University of Zimbabwe" />
                  <Field label="Year" value={e.year} onChange={(v) => setEdus((p) => p.map((x, k) => (k === i ? { ...x, year: v } : x)))} placeholder="2021" />
                </div>
              ))}
              <button
                onClick={() => setEdus((p) => [...p, { qualification: "", institution: "", year: "" }])}
                className="flex items-center gap-1 text-sm font-medium text-brand-700"
              >
                <Plus className="h-4 w-4" /> Add another
              </button>
            </>
          )}

          {step === "done" && (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <Check className="h-6 w-6" />
              </div>
              <p className="text-lg font-bold">That’s everything we need</p>
              <p className="text-sm text-gray-600">
                We’ll put {roles.filter((r) => r.role.trim()).length} job(s), {edus.filter((e) => e.qualification.trim()).length} qualification(s)
                {skills.length ? ` and ${skills.length} skill(s)` : ""} into your CV. Check your free ATS score, then let AI turn your
                answers into strong bullet points.
              </p>
            </div>
          )}

          {note && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{note}</p>}
          {note.startsWith("Sign in") && (
            <button onClick={() => signIn("google")} className="text-sm font-medium text-brand-700 underline">
              Sign in with Google
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => {
              setNote("");
              if (step === "role") setStep(current === 0 ? "target" : "more");
              else if (step === "questions") setStep("role");
              else if (step === "more") setStep(role.asked ? "questions" : "role");
              else if (step === "education") setStep("more");
              else if (step === "done") setStep("education");
            }}
            disabled={step === "target"}
            className="flex items-center gap-1 rounded-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="flex items-center gap-2">
            {step === "role" && (
              <button
                onClick={() => {
                  setNote("");
                  setStep("more");
                }}
                className="rounded-full px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
              >
                Skip questions
              </button>
            )}
            {step === "target" && <Next onClick={() => setStep("role")} label="Next" />}
            {step === "role" && (
              <button
                onClick={askQuestions}
                disabled={asking}
                className="flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {asking ? "Thinking…" : "Next"}
                {costs.cvQuestions > 0 && !asking && (
                  <span className="flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 text-xs">
                    <Coins className="h-3 w-3" /> {costs.cvQuestions}
                  </span>
                )}
              </button>
            )}
            {step === "questions" && <Next onClick={() => setStep("more")} label="Next" />}
            {step === "more" && <Next onClick={() => setStep("education")} label="No, that’s all" />}
            {step === "education" && <Next onClick={() => setStep("done")} label="Next" />}
            {step === "done" && (
              <button
                onClick={finish}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
              >
                <Check className="h-4 w-4" /> Add to my CV
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Question({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">{icon}</div>
      <div>
        <p className="text-lg font-bold leading-snug">{title}</p>
        {children && <p className="mt-0.5 text-sm text-gray-500">{children}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
    </label>
  );
}

function Next({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white">
      {label} <ArrowRight className="h-4 w-4" />
    </button>
  );
}
