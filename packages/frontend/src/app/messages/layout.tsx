import type { Metadata } from "next";
import { privateMeta } from "@/lib/seo";

// Signed-in page: titled, but kept out of search results.
export const metadata: Metadata = privateMeta("Messages", "/messages");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
