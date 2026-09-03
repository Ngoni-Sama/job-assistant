import { Clock, MapPin, ExternalLink } from "lucide-react";
import type { JobListing, JobScore } from "@/lib/types";

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-brand-600";
  return "text-gray-500";
}

export function JobCard({ job, score }: { job: JobListing; score?: JobScore }) {
  return (
    <div className="rounded-lg border bg-white p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{job.title}</h3>
          <p className="text-gray-600">{job.company}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {job.location}
            </span>
            {job.jobType && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                {job.jobType}
              </span>
            )}
            {job.postedDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {job.postedDate}
              </span>
            )}
            <span className="rounded bg-gray-100 px-1.5 text-xs">{job.source}</span>
          </div>
        </div>
        {score && (
          <div className="shrink-0 text-right">
            <div className={`text-2xl font-bold ${scoreColor(score.score)}`}>{score.score}%</div>
            <div className="text-xs text-gray-500">Match</div>
          </div>
        )}
      </div>

      {job.description && (
        <p className="mt-2 line-clamp-2 text-sm text-gray-700">{job.description}</p>
      )}

      {score && score.matchedSkills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {score.matchedSkills.slice(0, 6).map((s) => (
            <span key={s} className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <a
          href={job.applyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          View & Apply <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
