"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import {
  Coins,
  CheckCircle2,
  Lock,
  Sparkles,
  Wand2,
  Send,
  Loader2,
  XCircle,
  ShieldCheck,
  CreditCard,
  Smartphone,
  UserCheck,
  FileText,
} from "lucide-react";
import { api, payments } from "@/lib/api";
import type { CreditPack } from "@/lib/types";
import { playCoinSound } from "@/lib/sound";

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
      <BillingContent />
    </Suspense>
  );
}

type Verify = "idle" | "checking" | "paid" | "pending" | "failed";

function BillingContent() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const params = useSearchParams();
  const router = useRouter();

  const [balance, setBalance] = useState<number | null>(null);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [provider, setProvider] = useState<"pesepay" | "stripe" | "none">("pesepay");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [verify, setVerify] = useState<Verify>("idle");
  const [credited, setCredited] = useState(0);
  const polls = useRef(0);

  const ref = params.get("ref"); // set on Pesepay's return URL

  useEffect(() => {
    if (status === "loading" || !authed) return;
    Promise.all([api.getCredits(), api.getPacks()])
      .then(([c, p]) => {
        setBalance(c.balance);
        setCosts(c.costs);
        setPacks(p.packs);
        setProvider(p.provider);
        setCurrency(p.currency || "USD");
      })
      .catch((e) => setError((e as Error).message));
  }, [status, authed]);

  // Back from Pesepay → confirm the payment (poll briefly while it settles).
  useEffect(() => {
    if (!ref || !authed) return;
    let cancelled = false;
    async function check() {
      setVerify("checking");
      try {
        const r = await payments.verify(ref!);
        if (cancelled) return;
        if (r.status === "paid") {
          setVerify("paid");
          setCredited(r.credited);
          if (r.balance !== null) setBalance(r.balance);
          if (!r.already) playCoinSound();
          return;
        }
        if (r.status === "failed") return setVerify("failed");
        // Still processing (e.g. EcoCash awaiting PIN) — retry for ~1 minute.
        if (polls.current++ < 12) {
          setVerify("pending");
          setTimeout(check, 5000);
        } else setVerify("pending");
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setVerify("idle");
        }
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [ref, authed]);

  async function buy(packId: string) {
    setBusy(packId);
    setError("");
    try {
      const { redirectUrl } = await payments.initiate(packId);
      window.location.href = redirectUrl; // Pesepay-hosted page (card / EcoCash)
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (!authed && status !== "loading") {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-2 text-xl font-bold">Your credits</h1>
        <p className="mt-1 text-gray-600">Sign in to see your credit balance.</p>
        <button onClick={() => signIn("google")} className="mt-4 rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
          Sign in
        </button>
      </div>
    );
  }

  const bestValue = packs.reduce<CreditPack | null>(
    (best, p) => (!best || p.priceCents / p.credits < best.priceCents / best.credits ? p : best),
    null,
  );
  const money = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Payment result banner */}
      {ref && verify !== "idle" && (
        <div
          className={`flex items-center gap-2 rounded-2xl p-4 text-sm ${
            verify === "paid"
              ? "bg-green-50/90 text-green-700"
              : verify === "failed"
                ? "bg-red-50/90 text-red-700"
                : "bg-amber-50/90 text-amber-800"
          }`}
        >
          {verify === "paid" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : verify === "failed" ? (
            <XCircle className="h-5 w-5 shrink-0" />
          ) : (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          )}
          <span className="flex-1">
            {verify === "paid" && (credited ? `Payment received — ${credited} credits added. 🎉` : "Payment already applied to your account.")}
            {verify === "failed" && "The payment didn’t go through. You haven’t been charged — try again."}
            {(verify === "checking" || verify === "pending") &&
              "Confirming your payment… if you paid with EcoCash, approve the prompt on your phone."}
          </span>
          {(verify === "paid" || verify === "failed") && (
            <button onClick={() => router.replace("/billing")} className="text-xs underline">
              Dismiss
            </button>
          )}
        </div>
      )}

      <div className="glass-strong rounded-3xl p-8 text-center">
        <Coins className="mx-auto h-9 w-9 text-amber-500" />
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {balance === null ? "—" : balance} credits
        </h1>
        <p className="mt-1 text-gray-600">
          Credits power AI Apply, matching and verification.<span className="web-only"> Top up anytime.</span>
        </p>
      </div>

      {/* What things cost */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <CostCard icon={Sparkles} label="AI Apply" cost={costs.optimise} />
        <CostCard icon={Send} label="Match all jobs" cost={costs.matchAll} />
        <CostCard icon={Wand2} label="Quick Match" cost={costs.quickMatch} />
        <CostCard icon={UserCheck} label="Unlock a candidate" cost={costs.unlockContact} />
        <CostCard icon={FileText} label="ATS CV (AI-written)" cost={costs.atsCv} />
      </div>

      {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700">{error}</div>}

      {/* Buying is website-only (Google Play rules for the Android app). */}
      <section className="web-only space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold">Buy credits</h2>
          <PaymentMethods />
        </div>

        {provider !== "pesepay" ? (
          <div className="glass rounded-2xl p-6 text-center text-gray-600">
            Top-ups are temporarily unavailable. Please check back soon.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {packs.map((p) => {
              const best = bestValue?.id === p.id && packs.length > 1;
              return (
                <div
                  key={p.id}
                  className={`glass relative flex flex-col rounded-2xl p-6 text-center ${best ? "ring-2 ring-brand-500" : ""}`}
                >
                  {best && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-3 py-0.5 text-xs font-semibold text-white">
                      Best value
                    </span>
                  )}
                  <h3 className="text-lg font-bold">{p.label}</h3>
                  <p className="mt-2 flex items-center justify-center gap-1 text-3xl font-extrabold text-brand-700">
                    <Coins className="h-6 w-6 text-amber-500" /> {p.credits.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">credits</p>
                  <p className="mt-3 text-2xl font-bold">{money(p.priceCents)}</p>
                  <p className="text-xs text-gray-400">{money(Math.round((p.priceCents / p.credits) * 100))} per 100 credits</p>
                  <button
                    onClick={() => buy(p.id)}
                    disabled={busy !== null}
                    className="mt-4 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-4 py-2 text-sm font-medium text-white shadow-md disabled:opacity-50"
                  >
                    {busy === p.id ? "Redirecting to Pesepay…" : "Top up"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          Payments are processed securely by Pesepay. You’ll be redirected to pay by card or mobile money, then
          brought back here.
        </p>
      </section>
    </div>
  );
}

function PaymentMethods() {
  const methods = [
    { icon: CreditCard, label: "Visa" },
    { icon: CreditCard, label: "Mastercard" },
    { icon: Smartphone, label: "EcoCash" },
    { icon: Smartphone, label: "OneMoney" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {methods.map((m) => (
        <span key={m.label} className="flex items-center gap-1 rounded-full border bg-white/70 px-2 py-0.5 text-[11px] text-gray-600">
          <m.icon className="h-3 w-3" /> {m.label}
        </span>
      ))}
    </div>
  );
}

function CostCard({ icon: Icon, label, cost }: { icon: typeof Wand2; label: string; cost?: number }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <Icon className="h-5 w-5 shrink-0 text-brand-600" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="flex items-center gap-1 text-xs text-gray-500">
          <Coins className="h-3 w-3 text-amber-500" /> {cost ?? "—"}
        </p>
      </div>
    </div>
  );
}
