import Link from "next/link";
import { cityPath, sectorPath } from "@/lib/seo";

const BROWSE: [string, string][] = [
  ["Latest jobs", "/jobs"],
  ["Jobs in Harare", cityPath("Harare")],
  ["Jobs in Bulawayo", cityPath("Bulawayo")],
  ["IT jobs", sectorPath("IT & Software")],
  ["Finance & accounting jobs", sectorPath("Finance & Accounting")],
  ["Healthcare jobs", sectorPath("Healthcare")],
  ["Engineering jobs", sectorPath("Engineering")],
  ["NGO jobs", sectorPath("NGO & Development")],
  ["Graduate trainee jobs", sectorPath("Graduate Trainee")],
];

/** Site-wide footer. The Privacy/Terms links on the homepage are required for Google OAuth verification. */
export function Footer() {
  return (
    <footer className="mx-auto mt-8 max-w-6xl px-4 pb-8">
      <nav aria-label="Browse jobs" className="border-t border-gray-200/70 pt-6">
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {BROWSE.map(([label, href]) => (
            <li key={href}>
              <Link href={href} className="hover:text-brand-700 hover:underline">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-gray-500 sm:flex-row">
        <p>© {new Date().getFullYear()} VacancyPal · Find Jobs • Hire Talent • Grow Together</p>
        <nav aria-label="Site" className="flex flex-wrap justify-center gap-4">
          <Link href="/pricing" className="hover:text-brand-700 hover:underline">
            Pricing
          </Link>
          <Link href="/cv-builder" className="hover:text-brand-700 hover:underline">
            ATS CV Creator
          </Link>
          <Link href="/privacy" className="hover:text-brand-700 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-brand-700 hover:underline">
            Terms of Service
          </Link>
          <Link href="/how-we-use-gmail" className="hover:text-brand-700 hover:underline">
            How we use Gmail
          </Link>
        </nav>
      </div>
    </footer>
  );
}
