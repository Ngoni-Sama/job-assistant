"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Radar, MapPin, Info, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { JobListing } from "@/lib/types";
import { CompanyLogo } from "@/components/CompanyLogo";

export default function NearbyPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JobListing | null>(null);

  useEffect(() => {
    api.getJobs().then((r) => setJobs(r.jobs)).finally(() => setLoading(false));
    api.getProfile().then((p) => setCity(p.profile.location || "Harare")).catch(() => setCity("Harare"));
  }, []);

  const nearby = useMemo(() => {
    if (!city.trim()) return jobs.slice(0, 12);
    const c = city.toLowerCase();
    return jobs.filter((j) => j.location.toLowerCase().includes(c)).slice(0, 12);
  }, [jobs, city]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Radar className="h-6 w-6 text-brand-600" /> Jobs near me
        </h1>
        <div className="glass flex items-center gap-2 rounded-full px-4 py-2">
          <MapPin className="h-4 w-4 text-gray-400" />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="w-32 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <div className="glass-strong rounded-3xl p-6">
        {loading ? (
          <p className="py-10 text-center text-gray-500">Scanning…</p>
        ) : (
          <RadarScope jobs={nearby} onSelect={setSelected} selected={selected} />
        )}
      </div>

      {selected && (
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <CompanyLogo src={selected.logo} name={selected.company} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{selected.title}</p>
            <p className="truncate text-sm text-gray-500">
              {selected.company} · {selected.location} · {selected.salary || "TBA"}
            </p>
          </div>
          <Link
            href={`/jobs/${encodeURIComponent(selected.id)}`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm text-white"
          >
            Show more <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {!loading && nearby.length === 0 && (
        <p className="text-center text-gray-500">No jobs found in “{city}”. Try another city.</p>
      )}
    </div>
  );
}

function RadarScope({
  jobs,
  onSelect,
  selected,
}: {
  jobs: JobListing[];
  onSelect: (j: JobListing) => void;
  selected: JobListing | null;
}) {
  const size = 320;
  const c = size / 2;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <circle key={r} cx={c} cy={c} r={(c - 6) * r} fill="none" stroke="rgba(37,99,235,0.18)" />
        ))}
        <line x1={c} y1={6} x2={c} y2={size - 6} stroke="rgba(37,99,235,0.12)" />
        <line x1={6} y1={c} x2={size - 6} y2={c} stroke="rgba(37,99,235,0.12)" />
        {/* sweep */}
        <g className="radar-sweep">
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(37,99,235,0)" />
              <stop offset="1" stopColor="rgba(37,99,235,0.35)" />
            </linearGradient>
          </defs>
          <path d={`M ${c} ${c} L ${c} 6 A ${c - 6} ${c - 6} 0 0 1 ${size - 30} ${c} Z`} fill="url(#sweep)" />
        </g>
      </svg>

      {/* blips */}
      {jobs.map((job, i) => {
        const angle = (i / Math.max(jobs.length, 1)) * Math.PI * 2 + i * 0.6;
        const radius = (c - 34) * (0.35 + ((i * 37) % 60) / 100);
        const x = c + radius * Math.cos(angle);
        const y = c + radius * Math.sin(angle);
        const isSel = selected?.id === job.id;
        return (
          <button
            key={job.id}
            onClick={() => onSelect(job)}
            title={`${job.title} — ${job.company}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }}
          >
            <span className="relative flex">
              {isSel && (
                <span className="radar-ping absolute inset-0 rounded-full bg-brand-500/50" />
              )}
              {job.logo ? (
                <CompanyLogo src={job.logo} name={job.company} size={30} />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white">
                  <Info className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
          </button>
        );
      })}

      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600" />
    </div>
  );
}
