"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Upload, LayoutDashboard, Settings } from "lucide-react";
import { AuthButton } from "./AuthButton";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/upload", label: "Upload CV", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-brand-600">
          <Briefcase className="h-5 w-5" />
          Job Assistant
        </Link>
        <div className="flex items-center gap-3">
          <nav className="flex gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
