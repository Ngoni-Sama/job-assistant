"use client";

import Link from "next/link";
import { ShareButtons } from "@/components/ShareButtons";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  Sparkles,
  Layers,
  Zap,
  ArrowRight,
  GraduationCap,
  FileCheck2,
  MousePointerClick,
  Search,
  Briefcase,
  Building2,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  LogIn,
  Send,
} from "lucide-react";

export function LandingPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");

  return (
    <div className="space-y-16 pb-20">
      {/* Talent marketplace band */}
      <section className="glass-strong rounded-3xl p-8 text-center md:p-10">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Find jobs in Zimbabwe. Get discovered.
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-gray-600">
          Build your professional profile, show you’re available for work, and let verified
          employers come to you.
        </p>
        <div className="mx-auto mt-5 flex max-w-2xl flex-col gap-2 sm:flex-row">
          <label className="glass flex min-h-12 flex-1 cursor-text items-center gap-2 rounded-full px-4 focus-within:ring-2 focus-within:ring-brand-500/40">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Job title, skill or keyword"
              aria-label="Job title, skill or keyword"
              className="w-full bg-transparent py-3 text-base outline-none sm:text-sm"
            />
          </label>
          <label className="glass flex min-h-12 flex-1 cursor-text items-center gap-2 rounded-full px-4 focus-within:ring-2 focus-within:ring-brand-500/40">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Town, e.g. Harare"
              aria-label="Town"
              className="w-full bg-transparent py-3 text-base outline-none sm:text-sm"
            />
          </label>
          <Link
            href={`/jobs${keyword.trim() || city.trim() ? `?q=${encodeURIComponent(`${keyword} ${city}`.trim())}` : ""}`}
            className="rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-6 py-2.5 text-sm font-medium text-white"
          >
            Search
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => (authed ? (window.location.href = "/dashboard") : signIn("google"))}
            className="flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white"
          >
            <Briefcase className="h-4 w-4" /> I’m looking for work
          </button>
          <Link
            href="/employers"
            className="glass flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700"
          >
            <Building2 className="h-4 w-4" /> I’m hiring
          </Link>
        </div>
      </section>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl">
        <div className="glass-strong grid items-center gap-8 rounded-3xl p-8 md:grid-cols-2 md:p-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
              <Sparkles className="h-3.5 w-3.5" /> AI-powered job applications
            </span>
            <h2 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Sit back, relax —{" "}
              <span className="bg-gradient-to-r from-brand-500 to-brand-800 bg-clip-text text-transparent">
                let AI apply for you.
              </span>
            </h2>
            <p className="max-w-md text-lg text-gray-600">
              Carefully selected jobs, AI-tailored CVs, and one-swipe applications — your next role,
              right at your fingertips.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => (authed ? (window.location.href = "/dashboard") : signIn("google"))}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105"
              >
                {authed ? "Go to dashboard" : "Get started free"} <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/smart-match"
                className="glass flex items-center gap-2 rounded-full px-6 py-3 font-medium text-gray-700 transition-transform hover:scale-105"
              >
                <Zap className="h-4 w-4 text-brand-600" /> Try Swipe 2 Match
              </Link>
            </div>
          </div>

          {/* Illustration */}
          <div className="relative hidden md:block">
            <HeroIllustration />
          </div>
        </div>
      </section>

      {/* Audience hook */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: GraduationCap, title: "Recent graduate?", body: "Land your first role faster with AI-matched listings." },
          { icon: FileCheck2, title: "Struggling to find a job?", body: "We tailor your CV to each role automatically." },
          { icon: MousePointerClick, title: "No time to search?", body: "Swipe through hand-picked matches in minutes." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="glass rounded-2xl p-6">
            <Icon className="h-7 w-7 text-brand-600" />
            <h3 className="mt-3 text-lg font-bold">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{body}</p>
          </div>
        ))}
      </section>

      {/* The problem */}
      <section className="glass-strong rounded-3xl p-8 md:p-10">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">
          Stop scrolling job boards and hoping for the best.
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-gray-600 sm:text-center">
          Sending the same CV to fifty adverts and hearing nothing back isn’t bad luck — most CVs are screened out by
          software before anyone reads them. VacancyPal fixes the parts you can control.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { before: "Hours searching ten different job sites", after: "Live jobs from Zimbabwe’s top boards, in one place" },
            { before: "One generic CV for every job", after: "An ATS-ready CV, tailored to each role" },
            { before: "Applying and never hearing back", after: "Matched jobs only, sent from your own Gmail" },
          ].map((p) => (
            <div key={p.before} className="rounded-2xl bg-white/60 p-5">
              <p className="text-sm text-gray-500 line-through decoration-red-300">{p.before}</p>
              <p className="mt-2 flex gap-2 font-semibold text-gray-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> {p.after}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">How it works</h2>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: LogIn, title: "Sign in with Google", body: "Free, in one tap — plus free credits to try the AI." },
            { icon: FileText, title: "Build an ATS-ready CV", body: "Check your free ATS score, then let AI polish it — or upload the CV you have." },
            { icon: Zap, title: "Swipe jobs that fit", body: "We match live jobs to your profession. Swipe right on the ones you want." },
            { icon: Send, title: "Apply in seconds", body: "Each application is tailored and sent from your Gmail — or switch on Auto-apply." },
          ].map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="glass relative rounded-2xl p-6">
              <span className="absolute right-5 top-4 text-4xl font-extrabold text-accent-200">{i + 1}</span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-sm text-gray-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ATS CV Creator */}
      <section className="glass rounded-3xl p-8 md:p-10">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
              <ShieldCheck className="h-3.5 w-3.5" /> ATS-friendly CV Creator
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight">Get shortlisted, not filtered out.</h2>
            <p className="text-gray-600">
              Applicant-tracking systems scan for clear headings, the advert’s keywords and real results. Our CV
              Creator scores your CV against them as you type — free — and AI rewrites it into strong,
              keyword-matched bullets without inventing a single fact.
            </p>
            <ul className="space-y-1.5 text-sm text-gray-700">
              {[
                "Free ATS score with fixes you can act on",
                "Paste a job advert to see which keywords you’re missing",
                "PDF and Word downloads with real, selectable text",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> {t}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/cv-builder"
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105"
              >
                Check my CV free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="glass flex items-center gap-2 rounded-full px-6 py-3 font-medium text-gray-700">
                See pricing
              </Link>
            </div>
          </div>
          <AtsPreview />
        </div>
      </section>

      {/* Features */}
      <section className="space-y-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">
          Everything you need to get hired
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { icon: Layers, title: "Carefully selected jobs", body: "We scrape and refresh live listings across Zimbabwe's top job boards — only current openings." },
            { icon: Sparkles, title: "AI-tailored CVs", body: "Every application gets a CV and cover note rewritten to match the role's requirements." },
            { icon: Zap, title: "Swipe 2 Match", body: "Swipe right on the jobs you love. Green for yes, red for no — matching made effortless." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-sm text-gray-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Applications from the user's own Gmail (also explains the Gmail permission) */}
      <section className="glass rounded-3xl p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
            <Mail className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-extrabold tracking-tight">Applications go from your own Gmail</h2>
            <p className="text-gray-600">
              Signing in only shares your name, email and photo. When you first send an application from Gmail (or
              switch on Auto-apply), Google asks once for one permission — to send email on your behalf — so employers
              get your application from your own address and replies land in your inbox.
            </p>
            <ul className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  <b>You press Send.</b> Review each application first; nothing goes out until you send it.
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  <b>Or switch on Auto-apply.</b> Off by default. It applies only to jobs matching the sectors or
                  keywords you choose, within your daily limit, and you can turn it off any time.
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>We never read your inbox or send anything other than your job applications.</span>
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>Every application sent appears on your Applications page.</span>
              </li>
            </ul>
            <Link href="/how-we-use-gmail" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 underline">
              How VacancyPal uses Gmail <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight">Your next job is one swipe away.</h2>
        <p className="mx-auto mt-2 max-w-lg text-gray-600">
          Join now — upload your CV once and let the assistant do the rest.
        </p>
        <button
          onClick={() => (authed ? (window.location.href = "/dashboard") : signIn("google"))}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-8 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105"
        >
          {authed ? "Open dashboard" : "Get started free"} <ArrowRight className="h-4 w-4" />
        </button>
        <div className="mt-6 flex justify-center">
          <ShareButtons
            path="/"
            label="Tell a friend"
            text="VacancyPal — the latest jobs in Zimbabwe, an ATS-ready CV and one-swipe applications"
          />
        </div>
      </section>
    </div>
  );
}

/** Illustrative ATS score card for the CV Creator section. */
function AtsPreview() {
  const checks: [string, boolean][] = [
    ["Contact details", true],
    ["Bullets start with action verbs", true],
    ["Results with numbers", true],
    ["No weak phrases like “responsible for”", false],
    ["Keywords from the advert · 14/18", true],
  ];
  return (
    <div className="glass-strong mx-auto w-full max-w-sm space-y-4 rounded-3xl p-6" aria-hidden>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-8 border-green-500/80 text-2xl font-extrabold text-green-600">
          86
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">ATS score</p>
          <p className="text-lg font-bold">Strong</p>
          <p className="text-xs text-gray-500">Accountant · Harare</p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {checks.map(([label, ok]) => (
          <li key={label} className="flex gap-2">
            {ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span className="text-gray-700">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeroIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full drop-shadow-xl" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0071fa" />
          <stop offset="1" stopColor="#003bbc" />
        </linearGradient>
      </defs>
      <rect x="40" y="30" width="220" height="150" rx="18" fill="white" opacity="0.7" />
      <rect x="60" y="55" width="90" height="10" rx="5" fill="url(#g1)" />
      <rect x="60" y="78" width="150" height="7" rx="3.5" fill="#cbd5e1" />
      <rect x="60" y="94" width="130" height="7" rx="3.5" fill="#cbd5e1" />
      <rect x="60" y="120" width="70" height="24" rx="12" fill="url(#g1)" />
      <g transform="rotate(-8 300 150)">
        <rect x="180" y="90" width="180" height="200" rx="20" fill="url(#g1)" opacity="0.92" />
        <circle cx="270" cy="150" r="34" fill="white" opacity="0.9" />
        <rect x="215" y="205" width="110" height="10" rx="5" fill="white" opacity="0.85" />
        <rect x="230" y="225" width="80" height="8" rx="4" fill="white" opacity="0.6" />
        <text x="270" y="160" fontSize="30" textAnchor="middle" fill="#16a34a" fontWeight="bold">✓</text>
      </g>
    </svg>
  );
}
