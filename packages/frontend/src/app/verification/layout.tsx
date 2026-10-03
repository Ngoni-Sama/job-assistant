import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Get verified — background checks for job seekers",
  description:
    "Stand out to employers with identity, education, employment and police clearance checks shown as verified badges on your VacancyPal profile.",
  path: "/verification",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
