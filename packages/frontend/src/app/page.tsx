"use client";

import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  Sparkles,
  Layers,
  Zap,
  ArrowRight,
  GraduationCap,
  FileCheck2,
  MousePointerClick,
} from "lucide-react";

export default function LandingPage() {
  const { status } = useSession();
  const authed = status === "authenticated";

  return (
    <div className="space-y-16 pb-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl">
        <div className="glass-strong grid items-center gap-8 rounded-3xl p-8 md:grid-cols-2 md:p-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
              <Sparkles className="h-3.5 w-3.5" /> AI-powered job applications
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Sit back, relax —{" "}
              <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">
                let AI apply for you.
              </span>
            </h1>
            <p className="max-w-md text-lg text-gray-600">
              Carefully selected jobs, AI-tailored CVs, and one-swipe applications — your next role,
              right at your fingertips.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => (authed ? (window.location.href = "/dashboard") : signIn("google"))}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105"
              >
                {authed ? "Go to dashboard" : "Get started free"} <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/smart-match"
                className="glass flex items-center gap-2 rounded-full px-6 py-3 font-medium text-gray-700 transition-transform hover:scale-105"
              >
                <Zap className="h-4 w-4 text-brand-600" /> Try Smart Match
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
      <section className="grid gap-4 sm:grid-cols-3">
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

      {/* Features */}
      <section className="space-y-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">
          Everything you need to get hired
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Layers, title: "Carefully selected jobs", body: "We scrape and refresh live listings across Zimbabwe's top job boards — only current openings." },
            { icon: Sparkles, title: "AI-tailored CVs", body: "Every application gets a CV and cover note rewritten to match the role's requirements." },
            { icon: Zap, title: "Smart Match", body: "Swipe right on the jobs you love. Green for yes, red for no — matching made effortless." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-sm text-gray-600">{body}</p>
            </div>
          ))}
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
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-8 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105"
        >
          {authed ? "Open dashboard" : "Get started free"} <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
}

function HeroIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full drop-shadow-xl" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
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
