const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse an expiry string into an ISO date (yyyy-mm-dd).
 * Handles "Expires 07 Sep 2026", "7 September 2026", and ISO datetimes.
 * Returns undefined when no date can be extracted.
 */
export function parseExpiry(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Drop "Expires"/"before" prefixes and ordinal suffixes ("7th" -> "7").
  const s = raw
    .replace(/expires|before/gi, "")
    .replace(/(\d+)(st|nd|rd|th)/gi, "$1")
    .trim();

  // ISO datetime (e.g. jobszimbabwe <time datetime="2026-09-02T21:19:44+02:00">)
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "07 Sep 2026" / "7 September 2026"
  const dmy = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    const year = Number(dmy[3]);
    if (month !== undefined) {
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    }
  }
  return undefined;
}

/** True when the job has no expiry, or expires today or later (UTC day). */
export function isCurrent(expiryDate: string | undefined, now = new Date()): boolean {
  if (!expiryDate) return true;
  const today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  return expiryDate >= today; // lexical compare is valid for zero-padded ISO dates
}

const pad = (n: number) => String(n).padStart(2, "0");
