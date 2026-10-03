import type { Metadata } from "next";
import { privateMeta } from "@/lib/seo";

// Signed-in page: titled, but kept out of search results.
export const metadata: Metadata = privateMeta("Quick Match", "/quick-match");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
