import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Jobs near you",
  description:
    "See open jobs near you on a map — find vacancies close to home in Harare, Bulawayo and across Zimbabwe.",
  path: "/nearby",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
