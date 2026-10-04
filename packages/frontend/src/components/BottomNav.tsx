"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Briefcase, Building2, FileText, Heart, Home, LayoutDashboard, MessageSquare, Radar, Search, UserRound, Zap } from "lucide-react";
import { useMode } from "@/lib/mode";
import { useLive } from "./LiveUpdates";

type Tab = { href: string; label: string; icon: typeof Home; match?: (p: string) => boolean };

const GUEST: Tab[] = [
  { href: "/", label: "Home", icon: Home, match: (p) => p === "/" },
  { href: "/jobs", label: "Jobs", icon: Briefcase, match: (p) => p.startsWith("/jobs") },
  { href: "/smart-match", label: "Swipe", icon: Zap },
  { href: "/nearby", label: "Near me", icon: Radar },
  { href: "/cv-builder", label: "CV", icon: FileText },
];

const SEEKER: Tab[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase, match: (p) => p.startsWith("/jobs") },
  { href: "/smart-match", label: "Swipe", icon: Zap },
  { href: "/nearby", label: "Near me", icon: Radar },
  { href: "/profile", label: "Me", icon: UserRound, match: (p) => ["/profile", "/settings", "/applications", "/cv-builder", "/upload"].includes(p) },
];

const EMPLOYER: Tab[] = [
  { href: "/employers", label: "Hiring", icon: Building2, match: (p) => p === "/employers" },
  { href: "/employers/search", label: "Find", icon: Search },
  { href: "/employers/swipe", label: "Swipe", icon: Zap },
  { href: "/employers/candidates", label: "Shortlist", icon: Heart },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

/**
 * Phone navigation in thumb reach. Follows what the person is doing (looking for
 * work / hiring); the top bar keeps the logo, credits, alerts and full menu.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { status } = useSession();
  const mode = useMode();
  const { unread } = useLive();
  if (pathname.startsWith("/admin")) return null;

  const tabs = status !== "authenticated" ? GUEST : mode === "employer" ? EMPLOYER : SEEKER;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = t.match ? t.match(pathname) : pathname === t.href;
          const badge = t.href === "/messages" ? unread : 0;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium ${
                  active ? "text-brand-700" : "text-gray-600"
                }`}
              >
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-600" />}
                <t.icon className="h-5 w-5" />
                {t.label}
                {badge > 0 && (
                  <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
