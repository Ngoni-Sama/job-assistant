"use client";

import { useState } from "react";
import { Sparkles, Send, FileText, X, Coins } from "lucide-react";
import type { StoredCV } from "@/lib/types";

type Mode = "apply" | "optimise";

/** Short label for a CV — its (shortened) filename or "CV n". */
function label(cv: StoredCV, i: number): string {
  const base = cv.fileName?.replace(/\.[^.]+$/, "") ?? `CV ${i + 1}`;
  return base.length > 16 ? base.slice(0, 15) + "…" : base || `CV ${i + 1}`;
}

const CONFIG = {
  apply: {
    icon: Send,
    verb: "Apply",
    single: "Apply",
    open: "Apply with…",
    className:
      "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md hover:scale-[1.03]",
    itemClass: "text-brand-700",
  },
  optimise: {
    icon: Sparkles,
    verb: "AI Apply",
    single: "AI Apply",
    open: "AI Apply…",
    className: "border border-brand-200 bg-white/70 text-brand-700 hover:bg-white",
    itemClass: "text-violet-700",
  },
} as const;

/** A small coin badge showing the credit cost, e.g. 🪙 3. */
function CoinBadge({ cost }: { cost: number }) {
  return (
    <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
      <Coins className="h-3 w-3" /> {cost}
    </span>
  );
}

/**
 * Apply or Optimise action. With one CV it's a plain button; with several it
 * opens an animated radial menu to pick which CV to act with.
 *
 * `mode="apply"` is the free path (send with your CV); `mode="optimise"` runs
 * the AI tailoring and costs credits (shown as a hint).
 */
export function RadialApply({
  cvs,
  preparing,
  onApply,
  mode = "optimise",
  cost,
}: {
  cvs: StoredCV[];
  preparing: boolean;
  onApply: (cvId?: string) => void;
  mode?: Mode;
  /** Credit cost hint, e.g. 3 — shown on the optimise button. */
  cost?: number;
}) {
  const [open, setOpen] = useState(false);
  const cfg = CONFIG[mode];
  const Icon = cfg.icon;
  const showCoin = mode === "optimise" && !!cost;
  const busyLabel = mode === "apply" ? "Preparing…" : "AI applying…";

  if (cvs.length <= 1) {
    return (
      <button
        onClick={() => onApply(cvs[0]?.id)}
        disabled={preparing}
        title={mode === "optimise" ? "AI-tailor your CV to this job, then apply" : "Apply with your CV"}
        className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm transition-transform disabled:opacity-50 ${cfg.className}`}
      >
        <Icon className="h-3.5 w-3.5" /> {preparing ? busyLabel : cfg.single}
        {!preparing && showCoin && <CoinBadge cost={cost!} />}
      </button>
    );
  }

  const n = cvs.length;
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}

      {/* Radial items fan out up-and-left from the main button */}
      {cvs.map((cv, i) => {
        const angle = ((100 + (i * 90) / Math.max(n - 1, 1)) * Math.PI) / 180;
        const r = 78;
        const x = open ? Math.cos(angle) * r : 0;
        const y = open ? Math.sin(angle) * r : 0;
        return (
          <button
            key={cv.id}
            onClick={() => {
              onApply(cv.id);
              setOpen(false);
            }}
            title={`${cfg.verb} — ${cv.fileName}`}
            className={`glass-strong absolute bottom-0 left-0 z-20 flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium shadow-lg ${cfg.itemClass}`}
            style={{
              transform: `translate(${x}px, ${-y}px) scale(${open ? 1 : 0.3})`,
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: `transform 0.25s cubic-bezier(.2,.9,.3,1.3) ${i * 30}ms, opacity 0.2s ${i * 30}ms`,
            }}
          >
            <FileText className="h-3.5 w-3.5" /> {label(cv, i)}
          </button>
        );
      })}

      <button
        onClick={() => setOpen((v) => !v)}
        disabled={preparing}
        className={`relative z-20 flex items-center gap-1 rounded-full px-3 py-2 text-sm transition-transform disabled:opacity-50 ${cfg.className}`}
      >
        {open ? <X className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
        {preparing ? busyLabel : open ? "Pick a CV" : cfg.open}
        {!preparing && !open && showCoin && <CoinBadge cost={cost!} />}
      </button>
    </div>
  );
}
