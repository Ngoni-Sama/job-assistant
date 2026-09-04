"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Briefcase, Upload, LayoutDashboard, Settings, Shield, Zap, Wand2, Coins } from "lucide-react";
import { api } from "@/lib/api";
import { AuthButton } from "./AuthButton";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/smart-match", label: "Smart Match", icon: Zap },
  { href: "/quick-match", label: "Quick Match", icon: Wand2 },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/upload", label: "Upload CV", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setIsAdmin(false);
      setCredits(null);
      return;
    }
    api.getMe().then((me) => setIsAdmin(me.isAdmin)).catch(() => setIsAdmin(false));
    api.getCredits().then((c) => setCredits(c.balance)).catch(() => setCredits(null));
  }, [status]);

  const items = isAdmin ? [...links, { href: "/admin", label: "Admin", icon: Shield }] : links;

  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <Briefcase className="h-5 w-5" />
          <span className="hidden sm:inline">Job Assistant</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex gap-0.5 sm:gap-1">
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-white/80 text-brand-700 shadow-sm"
                      : "text-gray-600 hover:bg-white/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          {credits !== null && (
            <Link
              href="/billing"
              className="flex items-center gap-1 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200/80"
              title="Credits — buy more"
            >
              <Coins className="h-3.5 w-3.5" /> {credits}
            </Link>
          )}
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
