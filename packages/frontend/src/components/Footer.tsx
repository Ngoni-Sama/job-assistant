import Link from "next/link";

/** Site-wide footer. The Privacy/Terms links on the homepage are required for Google OAuth verification. */
export function Footer() {
  return (
    <footer className="mx-auto mt-8 max-w-6xl px-4 pb-8">
      <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200/70 pt-6 text-sm text-gray-500 sm:flex-row">
        <p>© {new Date().getFullYear()} VacancyPal · Find Jobs • Hire Talent • Grow Together</p>
        <nav className="flex gap-4">
          <Link href="/privacy" className="hover:text-brand-700 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-brand-700 hover:underline">
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
