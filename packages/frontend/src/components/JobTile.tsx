import { MapPin, CalendarClock, CalendarPlus, ExternalLink, Sparkles, CheckCircle2 } from "lucide-react";
import type { JobListing, JobScore } from "@/lib/types";

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-brand-100 text-brand-700";
  return "bg-gray-100 text-gray-600";
}

export function JobTile({
  job,
  score,
  applied,
  preparing,
  onApply,
}: {
  job: JobListing;
  score?: JobScore;
  applied?: boolean;
  preparing?: boolean;
  onApply: (job: JobListing) => void;
}) {
  return (
    <div className="glass flex flex-col rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-tight">{job.title}</h3>
          <p className="truncate text-sm text-gray-600">{job.company}</p>
        </div>
        {score && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${scoreColor(score.score)}`}>
            {score.score}%
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {job.location}
        </span>
        {job.sector && (
          <span className="rounded-full bg-violet-100/70 px-2 py-0.5 text-violet-700">{job.sector}</span>
        )}
        {job.jobType && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{job.jobType}</span>
        )}
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
        {job.postedDate && (
          <p className="flex items-center gap-1">
            <CalendarPlus className="h-3.5 w-3.5" /> Posted {job.postedDate}
          </p>
        )}
        {job.expiryDate ? (
          <p className="flex items-center gap-1 text-amber-700">
            <CalendarClock className="h-3.5 w-3.5" /> Expires {formatDate(job.expiryDate)}
          </p>
        ) : (
          job.postedDate === "" && <p className="text-gray-400">No expiry listed</p>
        )}
      </div>

      {job.description && (
        <p className="mt-2 line-clamp-3 text-sm text-gray-600">{job.description}</p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-3">
        {applied ? (
          <span className="flex items-center gap-1 rounded-full bg-green-100/80 px-3 py-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Applied
          </span>
        ) : (
          <button
            onClick={() => onApply(job)}
            disabled={preparing}
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-2 text-sm text-white shadow-md transition-transform hover:scale-[1.03] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {preparing ? "Optimising…" : "Optimise CV"}
          </button>
        )}
        <a
          href={job.applyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-full border border-white/50 bg-white/50 px-3 py-2 text-sm text-gray-600 hover:bg-white/70"
        >
          View <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
