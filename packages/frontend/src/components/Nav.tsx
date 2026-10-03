"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Archive,
  Briefcase,
  Building2,
  ChevronDown,
  Coins,
  CreditCard,
  FileText,
  Heart,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Radar,
  Repeat,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Upload,
  User,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { setMode, storedMode, useMode, type Mode } from "@/lib/mode";
import { AuthButton } from "./AuthButton";
import { NotificationBell } from "./NotificationBell";
import { useLive } from "./LiveUpdates";

/** `desc` is the one-line explanation shown in the menus, so every item makes sense. */
type Item = { href: string; label: string; icon: typeof Zap; desc?: string };

/** Looking for work. */
const SEEKER_PRIMARY: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/smart-match", label: "Swipe 2 Match", icon: Zap },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/nearby", label: "Near me", icon: Radar },
];
const SEEKER_MORE: Item[] = [
  { href: "/applications", label: "My applications", icon: Send, desc: "Jobs you’ve applied to" },
  { href: "/quick-match", label: "Quick Match", icon: Wand2, desc: "AI picks the jobs you fit best" },
  { href: "/cv-builder", label: "ATS CV Creator", icon: FileText, desc: "Build or improve your CV" },
  { href: "/upload", label: "Upload a CV", icon: Upload, desc: "Use the CV you already have" },
  { href: "/profile", label: "My profile", icon: User, desc: "What employers see about you" },
  { href: "/messages", label: "Messages", icon: MessageSquare, desc: "Chats with employers" },
  { href: "/verification", label: "Verified badge", icon: ShieldCheck, desc: "Checks that make employers trust you" },
  { href: "/archive", label: "Closed jobs", icon: Archive, desc: "Recently closed vacancies" },
  { href: "/billing", label: "Credits", icon: CreditCard, desc: "Your balance and top-ups" },
  { href: "/settings", label: "Settings", icon: Settings, desc: "Profession, alerts, auto-apply" },
];

/** Hiring. */
const EMPLOYER_PRIMARY: Item[] = [
  { href: "/employers", label: "Hiring home", icon: Building2 },
  { href: "/employers/search", label: "Find talent", icon: Search },
  { href: "/employers/swipe", label: "Swipe candidates", icon: Zap },
  { href: "/employers/candidates", label: "Shortlist", icon: Heart },
];
const EMPLOYER_MORE: Item[] = [
  { href: "/messages", label: "Messages", icon: MessageSquare, desc: "Chats with candidates" },
  { href: "/billing", label: "Credits", icon: CreditCard, desc: "Unlock candidates’ contact details" },
  { href: "/pricing", label: "Pricing", icon: Coins, desc: "What each action costs" },
  { href: "/settings", label: "Settings", icon: Settings, desc: "Notifications and account" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const authed = status === "authenticated";
  const mode = useMode();
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [hasThreads, setHasThreads] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteName, setSiteName] = useState("VacancyPal");
  const [scrolled, setScrolled] = useState(false);
  const { unread } = useLive();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    api.getSite().then((s) => s.site.name && setSiteName(s.site.name)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!authed) {
      setIsAdmin(false);
      setCredits(null);
      setHasThreads(false);
      return;
    }
    api.getMe().then((me) => setIsAdmin(me.isAdmin)).catch(() => setIsAdmin(false));
    api.getCredits().then((c) => setCredits(c.balance)).catch(() => setCredits(null));
    api.getThreads().then((r) => setHasThreads(r.threads.length > 0)).catch(() => {});
    // First visit on this device: people who registered a company start in hiring mode.
    if (!storedMode()) {
      api
        .getEmployer()
        .then((r) => r.employer && setMode("employer"))
        .catch(() => {});
    }
  }, [authed]);

  // Opening an employer page puts the menu in hiring mode (and the job pages back).
  useEffect(() => {
    if (pathname.startsWith("/employers") && mode !== "employer") setMode("employer");
    if (["/dashboard", "/smart-match", "/quick-match", "/applications", "/upload"].includes(pathname) && mode !== "seeker")
      setMode("seeker");
  }, [pathname, mode]);

  // Close menus on navigation.
  useEffect(() => {
    setMoreOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const primary = mode === "employer" ? EMPLOYER_PRIMARY : SEEKER_PRIMARY;
  let more = mode === "employer" ? EMPLOYER_MORE : SEEKER_MORE;
  // Job seekers only see Messages once an employer has started a conversation.
  if (mode === "seeker" && !hasThreads && unread === 0) more = more.filter((i) => i.href !== "/messages");
  if (!authed) more = more.filter((i) => !["/billing", "/messages", "/applications", "/settings"].includes(i.href));
  if (isAdmin) more = [...more, { href: "/admin", label: "Admin", icon: Shield, desc: "Users, prices, settings" }];

  function switchMode(next: Mode) {
    setMode(next);
    setMoreOpen(false);
    setMenuOpen(false);
    router.push(next === "employer" ? "/employers" : "/dashboard");
  }

  const switcher = (
    <button
      onClick={() => switchMode(mode === "employer" ? "seeker" : "employer")}
      className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-accent-700 hover:bg-accent-50"
    >
      <Repeat className="h-4 w-4" />
      {mode === "employer" ? "Switch to looking for work" : "Switch to hiring"}
    </button>
  );

  return (
    // Floating bar: detached from the edges, rounded, and a touch more shadow once scrolled.
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div
        className={`mx-auto max-w-6xl rounded-2xl transition-shadow duration-300 ${menuOpen ? "popover" : "glass"} ${
          scrolled ? "shadow-xl shadow-blue-900/10" : "shadow-md"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link href="/" className="flex items-center" aria-label={`${siteName} home`}>
            {/* Pin mark on phones, full wordmark from sm up. */}
            <Image src="/brand/logo-mark-nav.webp" alt={siteName} width={97} height={108} priority className="h-9 w-auto sm:hidden" />
            <Image src="/brand/logo-nav.webp" alt={siteName} width={404} height={108} priority className="hidden h-9 w-auto sm:block" />
          </Link>

          <div className="flex items-center gap-2">
            {/* Desktop: primary links + More dropdown */}
            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
              {primary.map((item) => (
                <NavLink key={item.href} item={item} active={pathname === item.href} />
              ))}
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors ${
                    moreOpen ? "bg-white/80 text-brand-700" : "text-gray-600 hover:bg-white/50"
                  }`}
                >
                  More
                  {unread > 0 && <span className="h-2 w-2 rounded-full bg-red-500" aria-label={`${unread} unread messages`} />}
                  <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                    <div className="popover absolute right-0 z-20 mt-2 w-72 rounded-2xl p-2">
                      <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {mode === "employer" ? "Hiring" : "Looking for work"}
                      </p>
                      {more.map((item) => (
                        <MenuLink key={item.href} item={item} active={pathname === item.href} badge={item.href === "/messages" ? unread : 0} />
                      ))}
                      {authed && switcher}
                    </div>
                  </>
                )}
              </div>
            </nav>

            {credits !== null && (
              <Link
                href="/billing"
                className="flex items-center gap-1 rounded-full bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-800 hover:bg-accent-200"
                title="Credits — buy more"
              >
                <Coins className="h-3.5 w-3.5" /> {credits}
              </Link>
            )}
            <NotificationBell />
            <AuthButton />

            {/* Mobile: hamburger */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="relative rounded-full p-2 text-gray-600 hover:bg-white/50 md:hidden"
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              {unread > 0 && !menuOpen && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile: full menu (opens inside the floating bar, which turns solid) */}
        {menuOpen && (
          <nav className="max-h-[75vh] overflow-y-auto border-t border-gray-100 p-2 md:hidden" aria-label="Menu">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {mode === "employer" ? "Hiring" : "Looking for work"}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {primary.map((item) => (
                <NavLink key={item.href} item={item} active={pathname === item.href} block />
              ))}
            </div>
            <div className="mt-1 border-t border-gray-100 pt-1">
              {more.map((item) => (
                <MenuLink key={item.href} item={item} active={pathname === item.href} badge={item.href === "/messages" ? unread : 0} />
              ))}
            </div>
            {authed && switcher}
          </nav>
        )}
      </div>
    </header>
  );
}

function NavLink({ item, active, block }: { item: Item; active: boolean; block?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${block ? "w-full" : ""} ${
        active ? "bg-brand-50 text-brand-700 shadow-sm" : "text-gray-600 hover:bg-gray-100/70"
      }`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

/** A menu row with its one-line explanation. */
function MenuLink({ item, active, badge = 0 }: { item: Item; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-start gap-2.5 rounded-xl px-3 py-2 transition-colors ${active ? "bg-brand-50" : "hover:bg-gray-50"}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-brand-700" : "text-gray-500"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${active ? "text-brand-700" : "text-gray-800"}`}>{item.label}</span>
        {item.desc && <span className="block text-xs text-gray-500">{item.desc}</span>}
      </span>
      {badge > 0 && (
        <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
