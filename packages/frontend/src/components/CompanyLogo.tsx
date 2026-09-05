"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

/** Company logo with a graceful icon fallback (no logo, or the image 404s). */
export function CompanyLogo({ src, name, size = 44 }: { src?: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const dim = { width: size, height: size };

  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        style={dim}
        className="shrink-0 rounded-xl border border-white/50 bg-white object-contain p-1"
      />
    );
  }
  return (
    <div
      style={dim}
      className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white"
      title={name}
    >
      <Building2 className="h-5 w-5" />
    </div>
  );
}

/** True when a job's deadline is in the past. */
export function isExpired(expiryDate?: string): boolean {
  if (!expiryDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expiryDate < today;
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
