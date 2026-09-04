"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  UserPlus,
  FileCheck2,
  ShieldCheck,
  Unlock,
  Building2,
  ArrowRight,
  Clock,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Employer } from "@/lib/types";

const STEPS = [
  { icon: UserPlus, title: "Register", body: "Create an employer account and start your company profile." },
  { icon: FileCheck2, title: "Submit for vetting", body: "Provide a contact person, upload company documents and accept our terms." },
  { icon: ShieldCheck, title: "Admin approval", body: "Our team reviews and approves your company, usually within 1–2 business days." },
  { icon: Unlock, title: "Unlock & hire", body: "Pick a package and reveal candidate contacts up to your monthly quota." },
];

export default function EmployersPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoaded(true);
      return;
    }
    api
      .getEmployer()
      .then((r) => setEmployer(r.employer))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  }, [status, authed]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.registerEmployer(company.trim(), contact.trim());
      setEmployer(r.employer);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-14 pb-16">
      <section className="glass-strong rounded-3xl p-8 text-center md:p-12">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
          <Building2 className="h-3.5 w-3.5" /> For employers
        </span>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Hire vetted, work-ready talent.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600">
          Get verified, choose a package, and unlock the contact details of candidates who are
          actively available for work.
        </p>

        {/* Auth / status-aware CTA */}
        <div className="mx-auto mt-6 max-w-md">
          {!loaded ? null : !authed ? (
            <button
              onClick={() => signIn("google")}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-6 py-3 font-medium text-white"
            >
              Sign in to register <ArrowRight className="h-4 w-4" />
            </button>
          ) : employer?.status === "approved" ? (
            <Link
              href="/employers/candidates"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-6 py-3 font-medium text-white"
            >
              <Users className="h-4 w-4" /> Browse candidates
            </Link>
          ) : employer?.status === "pending" ? (
            <div className="glass rounded-2xl p-4 text-sm text-amber-700">
              <Clock className="mx-auto mb-1 h-5 w-5" />
              <strong>{employer.company}</strong> is under review. We approve companies within 1–2
              business days.
            </div>
          ) : employer?.status === "rejected" ? (
            <div className="glass rounded-2xl p-4 text-sm text-red-700">
              Your application wasn’t approved. Contact support to appeal.
            </div>
          ) : (
            <form onSubmit={register} className="glass rounded-2xl p-4 text-left">
              <p className="mb-3 text-center text-sm font-medium">Register your company</p>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
                required
                className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contact person"
                required
                className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit for vetting"}
              </button>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-center text-2xl font-extrabold tracking-tight">How it works</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass relative rounded-2xl p-6">
              <span className="absolute right-4 top-4 text-3xl font-extrabold text-brand-100">
                {i + 1}
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
