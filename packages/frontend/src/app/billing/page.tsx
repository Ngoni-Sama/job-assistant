"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Coins, CheckCircle2, Lock, Sparkles, Wand2, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { CreditPack } from "@/lib/types";

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const params = useSearchParams();

  const [balance, setBalance] = useState<number | null>(null);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const checkoutStatus = params.get("checkout");

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) return;
    Promise.all([api.getCredits(), api.getPacks()])
      .then(([c, p]) => {
        setBalance(c.balance);
        setCosts(c.costs);
        setPacks(p.packs);
      })
      .catch((e) => setError((e as Error).message));
  }, [status, authed]);

  async function buy(packId: string) {
    setBusy(packId);
    setError("");
    try {
      const { url } = await api.checkout(packId);
      window.location.href = url; // Stripe-hosted checkout
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (!authed && status !== "loading") {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-2 text-xl font-bold">Billing</h1>
        <p className="mt-1 text-gray-600">Sign in to view your credits and buy more.</p>
        <button
          onClick={() => signIn("google")}
          className="mt-4 rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {checkoutStatus === "success" && (
        <div className="flex items-center gap-2 rounded-2xl bg-green-50/80 p-4 text-green-700">
          <CheckCircle2 className="h-5 w-5" /> Payment successful — your credits have been added.
        </div>
      )}
      {checkoutStatus === "cancel" && (
        <div className="rounded-2xl bg-amber-50/80 p-4 text-amber-800">Checkout cancelled.</div>
      )}

      <div className="glass-strong rounded-3xl p-8 text-center">
        <Coins className="mx-auto h-9 w-9 text-brand-600" />
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {balance === null ? "—" : balance} credits
        </h1>
        <p className="mt-1 text-gray-600">Credits power the AI features. Top up anytime.</p>
      </div>

      {/* What things cost */}
      <div className="grid gap-3 sm:grid-cols-3">
        <CostCard icon={Wand2} label="Quick Match" cost={costs.quickMatch} />
        <CostCard icon={Sparkles} label="Optimise CV" cost={costs.optimise} />
        <CostCard icon={Send} label="Match all jobs" cost={costs.matchAll} />
      </div>

      {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700">{error}</div>}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Buy credits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {packs.map((p) => (
            <div key={p.id} className="glass flex flex-col rounded-2xl p-6 text-center">
              <h3 className="text-lg font-bold">{p.label}</h3>
              <p className="mt-2 text-3xl font-extrabold text-brand-700">{p.credits}</p>
              <p className="text-sm text-gray-500">credits</p>
              <p className="mt-3 text-2xl font-bold">${(p.priceCents / 100).toFixed(2)}</p>
              <button
                onClick={() => buy(p.id)}
                disabled={busy !== null}
                className="mt-4 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md disabled:opacity-50"
              >
                {busy === p.id ? "Redirecting…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Payments are processed securely by Stripe. You’ll be redirected to complete your purchase.
        </p>
      </section>
    </div>
  );
}

function CostCard({
  icon: Icon,
  label,
  cost,
}: {
  icon: typeof Wand2;
  label: string;
  cost?: number;
}) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <Icon className="h-5 w-5 text-brand-600" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500">{cost ?? "—"} credits</p>
      </div>
    </div>
  );
}
