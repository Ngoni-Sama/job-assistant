import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Swipe 2 Match — swipe through jobs that fit you",
  description:
    "Swipe right on the Zimbabwe jobs you want and build a shortlist in minutes. Filter by your profession or by sector, then apply with one tap.",
  path: "/smart-match",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
