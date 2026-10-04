"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  Gift,
  Send,
  Sparkles,
  UserCheck,
  Wand2,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCosts } from "@/lib/useCosts";
import type { CreditPack } from "@/lib/types";

/** Shown until the live packs load (same as the server defaults). */
const DEFAULT_PACKS: CreditPack[] = [
  { id: "starter", label: "Starter", credits: 100, priceCents: 500 },
  { id: "standard", label: "Standard", credits: 300, priceCents: 1200 },
  { id: "pro", label: "Pro", credits: 1000, priceCents: 3500 },
];

const FREE_FEATURES = [
  "Browse every live job and get job alerts",
  "Swipe 2 Match and your shortlist",
  "CV Creator with a free ATS score check",
  "Download your CV as PDF or Word",
  "Send applications from your own Gmail",
  "Profile, availability and employer messages",
];

export default function PricingPage() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const costs = useCosts();
  const [packs, setPacks] = useState<CreditPack[]>(DEFAULT_PACKS);
  const [currency, setCurrency] = useState("USD");
  const [freeCredits, setFreeCredits] = useState(50);

  useEffect(() => {
    api
      .getPacks()
      .then((r) => {
        if (r.packs.length) setPacks(r.packs);
        if (r.currency) setCurrency(r.currency);
      })
      .catch(() => {});
    api
      .getSite()
      .then((s) => typeof s.payments?.freeCredits === "number" && setFreeCredits(s.payments.freeCredits))
      .catch(() => {});
  }, []);

  const money = (cents: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const perCredit = (p: CreditPack) => p.priceCents / 100 / p.credits;
  const best = packs.reduce<CreditPack | null>((b, p) => (!b || perCredit(p) < perCredit(b) ? p : b), null);
  const popular = packs.length >= 3 ? packs[1] : null;
  const starter = packs[0];
  const approx = (credits: number) => (starter ? money(Math.round(credits * perCredit(starter) * 100)) : "");
  const fits = (p: CreditPack, cost: number) => (cost > 0 ? Math.floor(p.credits / cost) : 0);

  const actions = [
    { icon: FileText, label: "ATS CV written by AI", body: "Headline, summary, achievement bullets and skills — from your own details", cost: costs.atsCv },
    { icon: Sparkles, label: "AI Apply", body: "CV summary and cover note tailored to one job (also each Auto-apply)", cost: costs.optimise },
    { icon: Send, label: "Match all jobs", body: "Score the latest jobs against your CV", cost: costs.matchAll },
    { icon: Wand2, label: "Quick Match", body: "AI picks the jobs you’re a strong fit for", cost: costs.quickMatch },
    { icon: UserCheck, label: "Unlock a candidate", body: "Employers: reveal one candidate’s contact details", cost: costs.unlockContact },
  ];

  const start = () => (authed ? (window.location.href = "/billing") : signIn("google"));

  return (
    <div className="mx-auto max-w-5xl space-y-12 pb-16">
      <section className="glass-strong rounded-3xl p-8 text-center md:p-12">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700">
          <Coins className="h-3.5 w-3.5" /> Pay as you go · no subscription
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Pay for results,{" "}
          <span className="bg-gradient-to-r from-brand-500 to-brand-800 bg-clip-text text-transparent">not monthly fees.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-left text-lg text-gray-600 sm:text-center">
          Searching, swiping and applying are free. Buy credits only for the AI that does the heavy lifting — like an
          ATS-ready CV for about {approx(costs.atsCv)}.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5 text-sm font-medium text-green-800">
          <Gift className="h-4 w-4" /> {freeCredits} free credits when you sign up
        </p>
      </section>

      {/* Packs */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {packs.map((p) => {
          const isPopular = popular?.id === p.id;
          const isBest = best?.id === p.id && packs.length > 1;
          return (
            <div
              key={p.id}
              className={`glass relative flex flex-col rounded-3xl p-6 ${isPopular ? "ring-2 ring-brand-500 md:-translate-y-2" : ""}`}
            >
              {(isPopular || isBest) && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent-400 to-accent-500 px-3 py-0.5 text-xs font-semibold text-gray-900 shadow-sm">
                  {isPopular ? "Most popular" : "Best value"}
                </span>
              )}
              <h2 className="text-lg font-bold">{p.label}</h2>
              <p className="mt-2 text-4xl font-extrabold tracking-tight">{money(p.priceCents)}</p>
              <p className="text-sm text-gray-500">
                {p.credits.toLocaleString()} credits ·{" "}
                {new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(perCredit(p))}{" "}
                each
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-gray-700">
                {costs.atsCv > 0 && (
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    Up to {fits(p, costs.atsCv)} AI-written ATS CV{fits(p, costs.atsCv) === 1 ? "" : "s"}
                  </li>
                )}
                {costs.optimise > 0 && (
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    or up to {fits(p, costs.optimise)} tailored AI applications
                  </li>
                )}
                {costs.quickMatch > 0 && (
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    or {fits(p, costs.quickMatch)} Quick Match runs
                  </li>
                )}
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Mix and match — spend credits on anything
                </li>
              </ul>
              <button
                onClick={start}
                className={`mt-6 flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium ${
                  isPopular ? "bg-gradient-to-r from-brand-500 to-brand-800 text-white shadow-lg" : "border bg-white/70 text-gray-800 hover:bg-white"
                }`}
              >
                {authed ? `Buy ${p.label}` : "Sign up free"} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </section>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-gray-500">
        Pay securely with
        {[
          { icon: CreditCard, label: "Visa" },
          { icon: CreditCard, label: "Mastercard" },
          { icon: Smartphone, label: "EcoCash" },
          { icon: Smartphone, label: "OneMoney" },
        ].map((m) => (
          <span key={m.label} className="flex items-center gap-1 rounded-full border bg-white/70 px-2 py-0.5 text-xs text-gray-600">
            <m.icon className="h-3 w-3" /> {m.label}
          </span>
        ))}
      </div>

      {/* Free vs credits */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h2 className="text-xl font-bold">Always free</h2>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass rounded-3xl p-6">
          <h2 className="text-xl font-bold">What credits buy</h2>
          <ul className="mt-4 divide-y divide-gray-200/70">
            {actions.map((a) => (
              <li key={a.label} className="flex items-start gap-3 py-2.5">
                <a.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-xs text-gray-500">{a.body}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="flex items-center justify-end gap-1 text-sm font-semibold">
                    <Coins className="h-3.5 w-3.5 text-amber-500" /> {a.cost}
                  </span>
                  <span className="block text-[11px] text-gray-500">≈ {approx(a.cost)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">≈ prices at the {starter?.label ?? "Starter"} pack rate — bigger packs cost less per credit.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="glass rounded-3xl p-6 md:p-8">
        <h2 className="text-xl font-bold">Questions</h2>
        <dl className="mt-4 grid gap-5 text-sm md:grid-cols-2">
          <div>
            <dt className="font-semibold">Is there a subscription?</dt>
            <dd className="mt-1 text-gray-600">No. You buy credits when you need them and spend them on any AI feature.</dd>
          </div>
          <div>
            <dt className="font-semibold">What if the AI fails?</dt>
            <dd className="mt-1 text-gray-600">
              If the CV writer or AI Apply can’t give you a result, your credits go straight back to your balance.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Will the AI make things up on my CV?</dt>
            <dd className="mt-1 text-gray-600">
              No. It only rewrites what you enter, and the app removes any job, number or skill you didn’t give it.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">What does “ATS-friendly” mean?</dt>
            <dd className="mt-1 text-gray-600">
              A simple layout with standard headings and real, selectable text, so the software many employers use to
              screen CVs can read every word.
            </dd>
          </div>
        </dl>
      </section>

      <section className="glass-strong rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight">Start with a free ATS check.</h2>
        <p className="mx-auto mt-2 max-w-lg text-gray-600">See how your CV scores before you spend anything.</p>
        <Link
          href="/cv-builder"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-7 py-3 font-medium text-white shadow-lg transition-transform hover:scale-105"
        >
          Open the CV Creator <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
