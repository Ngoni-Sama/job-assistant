"use client";

import { UserPlus, FileCheck2, ShieldCheck, Unlock, Building2, ArrowRight } from "lucide-react";

const STEPS = [
  { icon: UserPlus, title: "Register", body: "Create an employer account and start your company profile." },
  { icon: FileCheck2, title: "Submit for vetting", body: "Provide a contact person, upload company documents and accept our terms." },
  { icon: ShieldCheck, title: "Admin approval", body: "Our team reviews and approves your company, usually within 1–2 business days." },
  { icon: Unlock, title: "Unlock & hire", body: "Pick a package and reveal candidate contacts up to your monthly quota." },
];

export default function EmployersPage() {
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
        <button
          disabled
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-6 py-3 font-medium text-white opacity-70"
        >
          Employer sign-up — coming soon <ArrowRight className="h-4 w-4" />
        </button>
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

      <section className="glass rounded-3xl p-8 text-center text-sm text-gray-500">
        The full employer experience — candidate sector tiles, swipe-to-shortlist, profile cards and
        messaging — is in active development. Check back soon.
      </section>
    </div>
  );
}
