"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Briefcase,
  Upload,
  LayoutDashboard,
  Settings,
  Shield,
  Zap,
  Wand2,
  Coins,
  User,
  Radar,
  MessageSquare,
  Archive,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { AuthButton } from "./AuthButton";

type Item = { href: string; label: string; icon: typeof Zap };

const primary: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/smart-match", label: "Smart Match", icon: Zap },
  { href: "/quick-match", label: "Quick Match", icon: Wand2 },
  { href: "/jobs", label: "My Jobs", icon: Briefcase },
];

const secondary: Item[] = [
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/nearby", label: "Nearby", icon: Radar },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/upload", label: "Upload CV", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setIsAdmin(false);
      setCredits(null);
      return;
    }
    api.getMe().then((me) => setIsAdmin(me.isAdmin)).catch(() => setIsAdmin(false));
    api.getCredits().then((c) => setCredits(c.balance)).catch(() => setCredits(null));
  }, [status]);

  // Close menus on navigation.
  useEffect(() => {
    setMoreOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const secondaryItems = isAdmin
    ? [...secondary, { href: "/admin", label: "Admin", icon: Shield }]
    : secondary;
  const allItems = [...primary, ...secondaryItems];

  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <Briefcase className="h-5 w-5" />
          <span className="hidden sm:inline">Job Assistant</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Desktop: primary links + More dropdown */}
          <nav className="hidden items-center gap-0.5 md:flex">
            {primary.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  moreOpen ? "bg-white/80 text-brand-700" : "text-gray-600 hover:bg-white/50"
                }`}
              >
                More <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                  <div className="glass-strong absolute right-0 z-20 mt-2 w-52 rounded-2xl p-2 shadow-xl">
                    {secondaryItems.map((item) => (
                      <NavLink key={item.href} item={item} active={pathname === item.href} block />
                    ))}
                  </div>
                </>
              )}
            </div>
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

          {/* Mobile: hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full p-2 text-gray-600 hover:bg-white/50 md:hidden"
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile: full menu */}
      {menuOpen && (
        <nav className="glass-strong mx-4 mb-3 grid grid-cols-2 gap-1 rounded-2xl p-2 md:hidden">
          {allItems.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} block />
          ))}
        </nav>
      )}
    </header>
  );
}

function NavLink({ item, active, block }: { item: Item; active: boolean; block?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
        block ? "w-full" : ""
      } ${active ? "bg-white/80 text-brand-700 shadow-sm" : "text-gray-600 hover:bg-white/50"}`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
