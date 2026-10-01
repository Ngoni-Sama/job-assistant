import "server-only";
import { WORKER_BASE } from "@/lib/server/worker";

export const FALLBACK_SUPPORT_EMAIL = "support@vacancypal.co.zw";

/**
 * Public site settings for server-rendered pages (privacy, terms). Uses the
 * Support email from Admin → Site; falls back when unset or unreachable.
 */
export async function getSiteInfo(): Promise<{ name: string; supportEmail: string }> {
  try {
    const res = await fetch(`${WORKER_BASE}/api/site`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = (await res.json()) as { site?: { name?: string; supportEmail?: string } };
      return {
        name: data.site?.name || "VacancyPal",
        supportEmail: data.site?.supportEmail || FALLBACK_SUPPORT_EMAIL,
      };
    }
  } catch {
    /* fall through */
  }
  return { name: "VacancyPal", supportEmail: FALLBACK_SUPPORT_EMAIL };
}
