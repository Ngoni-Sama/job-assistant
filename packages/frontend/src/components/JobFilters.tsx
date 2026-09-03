"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
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

export function JobFilters({ facets, sel, toggle, clear, activeCount }: FiltersProps) {
  const visible = facets.filter((f) => f.options.length > 1);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border bg-white p-3">
      {visible.map(({ facet, options }) => (
        <div key={facet} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
            {FACET_LABELS[facet]}
          </span>
          {options.slice(0, 12).map(([value, count]) => {
            const active = sel[facet].has(value);
            return (
              <button
                key={value}
                onClick={() => toggle(facet, value)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-brand-300"
                }`}
              >
                {value} <span className={active ? "opacity-80" : "text-gray-400"}>{count}</span>
              </button>
            );
          })}
        </div>
      ))}
      {activeCount > 0 && (
        <button
          onClick={clear}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
        >
          <X className="h-3 w-3" /> Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
