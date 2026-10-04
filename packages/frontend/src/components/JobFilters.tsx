"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { JobListing } from "@/lib/types";

type Facet = "sector" | "location" | "jobType" | "source";
type Selection = Record<Facet, Set<string>>;

const FACET_LABELS: Record<Facet, string> = {
  sector: "Sector",
  location: "Location",
  jobType: "Type",
  source: "Source",
};

const FACETS: Facet[] = ["sector", "location", "jobType", "source"];

/** Count distinct values for a facet, most common first. */
function facetCounts(jobs: JobListing[], facet: Facet): [string, number][] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const v = job[facet];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function useJobFilters(jobs: JobListing[]) {
  const [sel, setSel] = useState<Selection>({
    sector: new Set(),
    location: new Set(),
    jobType: new Set(),
    source: new Set(),
  });

  const facets = useMemo(
    () => FACETS.map((f) => ({ facet: f, options: facetCounts(jobs, f) })),
    [jobs],
  );

  const filtered = useMemo(
    () =>
      jobs.filter((job) =>
        (Object.keys(sel) as Facet[]).every((f) => {
          const chosen = sel[f];
          if (chosen.size === 0) return true;
          const v = job[f];
          return v !== undefined && chosen.has(v);
        }),
      ),
    [jobs, sel],
  );

  const toggle = (facet: Facet, value: string) =>
    setSel((prev) => {
      const next = new Set(prev[facet]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...prev, [facet]: next };
    });

  const clear = () =>
    setSel({ sector: new Set(), location: new Set(), jobType: new Set(), source: new Set() });

  const activeCount =
    sel.sector.size + sel.location.size + sel.jobType.size + sel.source.size;

  return { filtered, facets, sel, toggle, clear, activeCount };
}

type FiltersProps = ReturnType<typeof useJobFilters>;

/**
 * Job filters. Desktop: an always-open panel. Phones: one "Filters" button plus
 * the active filters as removable chips, so the jobs are on the first screen;
 * the full list opens as a bottom sheet with "Show N jobs" in thumb reach.
 */
export function JobFilters({ facets, sel, toggle, clear, activeCount, filtered }: FiltersProps) {
  const [open, setOpen] = useState(false);
  const visible = facets.filter((f) => f.options.length > 1);

  // Lock page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (visible.length === 0) return null;

  const active = (Object.keys(sel) as Facet[]).flatMap((f) => [...sel[f]].map((v) => ({ facet: f, value: v })));

  const chips = (size: "sm" | "lg") =>
    visible.map(({ facet, options }) => (
      <div
        key={facet}
        role="group"
        aria-label={FACET_LABELS[facet]}
        className={size === "lg" ? "space-y-2" : "flex items-start gap-2"}
      >
        <p
          className={
            size === "lg"
              ? "text-sm font-semibold text-gray-800"
              : "w-20 shrink-0 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          }
        >
          {FACET_LABELS[facet]}
        </p>
        <div className="flex flex-wrap gap-2">
          {options.slice(0, size === "lg" ? 30 : 12).map(([value, count]) => {
            const on = sel[facet].has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(facet, value)}
                aria-pressed={on}
                className={`rounded-full border transition-colors ${
                  size === "lg" ? "min-h-11 px-4 text-sm" : "min-h-8 px-3 text-xs"
                } ${on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 bg-gray-50 text-gray-700 hover:border-brand-300"}`}
              >
                {value} <span className={on ? "opacity-80" : "text-gray-500"}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    ));

  return (
    <>
      {/* Phones */}
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
        {active.map(({ facet, value }) => (
          <button
            key={`${facet}:${value}`}
            type="button"
            onClick={() => toggle(facet, value)}
            aria-label={`Remove filter ${value}`}
            className="flex min-h-11 items-center gap-1 rounded-full bg-brand-50 px-3 text-sm text-brand-700"
          >
            {value} <X className="h-4 w-4" />
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-gray-900/50 md:hidden" role="dialog" aria-modal="true" aria-label="Filter jobs">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <p className="text-lg font-bold">Filter jobs</p>
              <button onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close filters">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">{chips("lg")}</div>
            <div className="flex gap-3 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={clear}
                disabled={activeCount === 0}
                className="min-h-12 rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 flex-1 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white"
              >
                Show {filtered.length} {filtered.length === 1 ? "job" : "jobs"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop */}
      <div className="hidden space-y-3 rounded-2xl border border-gray-200 bg-white p-4 md:block">
        {chips("sm")}
        {activeCount > 0 && (
          <button onClick={clear} className="flex min-h-8 items-center gap-1 text-sm text-gray-600 hover:text-red-600">
            <X className="h-4 w-4" /> Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </>
  );
}
