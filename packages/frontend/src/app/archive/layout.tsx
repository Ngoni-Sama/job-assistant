import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Closed jobs archive",
  description:
    "Recently closed vacancies in Zimbabwe — see who has been hiring, for which roles, and what they asked for.",
  path: "/archive",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
