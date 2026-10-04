import Link from "next/link";
import type { JobGroup } from "@/lib/jobGroups";

/** "Browse by sector / town" link lists — server-rendered internal links to the landing pages. */
export function BrowseJobs({
  sectors,
  cities,
  current,
}: {
  sectors: JobGroup[];
  cities: JobGroup[];
  /** Slug of the page we're on (not linked to itself). */
  current?: string;
}) {
  if (!sectors.length && !cities.length) return null;
  return (
    <section className="glass space-y-5 rounded-3xl p-6">
      {sectors.length > 0 && (
        <div>
          <h2 className="text-lg font-bold">Browse jobs by sector</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {sectors.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/jobs/sector/${g.slug}`}
                  aria-current={g.slug === current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm ${
                    g.slug === current ? "bg-brand-600 text-white" : "bg-white/70 text-gray-700 hover:bg-white"
                  }`}
                >
                  {g.name} jobs <span className="opacity-70">({g.jobs.length})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cities.length > 0 && (
        <div>
          <h2 className="text-lg font-bold">Browse jobs by town</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {cities.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/jobs/location/${g.slug}`}
                  aria-current={g.slug === current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm ${
                    g.slug === current ? "bg-brand-600 text-white" : "bg-white/70 text-gray-700 hover:bg-white"
                  }`}
                >
                  Jobs in {g.name} <span className="opacity-70">({g.jobs.length})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
