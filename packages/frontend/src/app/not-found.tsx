import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="glass-strong mx-auto max-w-xl space-y-4 rounded-3xl p-10 text-center">
      <SearchX className="mx-auto h-10 w-10 text-brand-600" />
      <h1 className="text-2xl font-extrabold tracking-tight">This page has moved or closed</h1>
      <p className="text-gray-600">
        The job may have closed or the link is out of date. Plenty more are open right now.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/jobs"
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-6 py-2.5 text-sm font-medium text-white"
        >
          Browse open jobs <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/archive" className="glass rounded-full px-6 py-2.5 text-sm font-medium text-gray-700">
          Closed jobs
        </Link>
        <Link href="/" className="glass rounded-full px-6 py-2.5 text-sm font-medium text-gray-700">
          Home
        </Link>
      </div>
    </div>
  );
}
