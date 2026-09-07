"use client";

import { useState } from "react";
import { Sparkles, FileText, X } from "lucide-react";
import type { StoredCV } from "@/lib/types";

/** Short label for a CV — its (shortened) filename or "CV n". */
function label(cv: StoredCV, i: number): string {
  const base = cv.fileName?.replace(/\.[^.]+$/, "") ?? `CV ${i + 1}`;
  return base.length > 16 ? base.slice(0, 15) + "…" : base || `CV ${i + 1}`;
}

/**
 * Apply/Optimise action. With one CV it's a plain button; with several it opens
 * an animated radial menu to pick which CV to apply with.
 */
export function RadialApply({
  cvs,
  preparing,
  onApply,
}: {
  cvs: StoredCV[];
  preparing: boolean;
  onApply: (cvId?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (cvs.length <= 1) {
    return (
      <button
        onClick={() => onApply(cvs[0]?.id)}
        disabled={preparing}
        className="flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-2 text-sm text-white shadow-md transition-transform hover:scale-[1.03] disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" /> {preparing ? "Optimising…" : "Optimise CV"}
      </button>
    );
  }

  const n = cvs.length;
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}

      {/* Radial items fan out up-and-left from the main button */}
      {cvs.map((cv, i) => {
        // Spread across a quarter arc (about 100° to 190°).
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
            title={cv.fileName}
            className="glass-strong absolute bottom-0 left-0 z-20 flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium text-brand-700 shadow-lg"
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
        className="relative z-20 flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-2 text-sm text-white shadow-md transition-transform hover:scale-[1.03] disabled:opacity-50"
      >
        {open ? <X className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
        {preparing ? "Optimising…" : open ? "Pick a CV" : "Apply with…"}
      </button>
    </div>
  );
}
