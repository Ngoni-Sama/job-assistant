import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Hire talent in Zimbabwe",
  description:
    "Find candidates who are available now, swipe through verified profiles, and unlock contact details only for the people you want to talk to.",
  path: "/employers",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
