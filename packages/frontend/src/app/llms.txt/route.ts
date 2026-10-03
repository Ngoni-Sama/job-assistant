import { SITE_URL, jobPath, DEFAULT_DESCRIPTION } from "@/lib/seo";
import { fetchJobs, fetchPricing } from "@/lib/server/jobs";
import { groupByCity, groupBySector, openJobs } from "@/lib/jobGroups";

// /llms.txt — a plain-Markdown guide to the site for AI assistants and LLM crawlers
// (https://llmstxt.org). Rebuilt hourly so the job links stay current.
export const revalidate = 3600;

export async function GET() {
  const [all, pricing] = await Promise.all([fetchJobs(), fetchPricing()]);
  const jobs = openJobs(all);
  const u = (path: string) => `${SITE_URL}${path}`;
  const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

  const lines: string[] = [
    "# VacancyPal",
    "",
    `> ${DEFAULT_DESCRIPTION} VacancyPal gathers current vacancies from Zimbabwe's main job boards into one place, matches them to a candidate's profession, and helps them apply.`,
    "",
    "VacancyPal is for job seekers in Zimbabwe (mainly Harare and Bulawayo) and for employers hiring there. Browsing jobs, Swipe 2 Match, the ATS score check and sending applications are free; AI features use prepaid credits (no subscription).",
    "",
    "## Main pages",
    "",
    `- [Latest jobs in Zimbabwe](${u("/jobs")}): every open vacancy, searchable by title, company and town`,
    `- [ATS CV Creator](${u("/cv-builder")}): build an ATS-friendly CV with a free ATS score; optional AI writing that never invents facts`,
    `- [Swipe 2 Match](${u("/smart-match")}): swipe through jobs that fit your profession and build a shortlist`,
    `- [Pricing](${u("/pricing")}): credit packs and what each AI feature costs`,
    `- [For employers](${u("/employers")}): find and contact verified candidates`,
    `- [Get verified](${u("/verification")}): identity, education and background checks for candidates`,
    `- [How VacancyPal uses Gmail](${u("/how-we-use-gmail")}): applications are sent from the user's own Gmail, only with their permission`,
    `- [Privacy Policy](${u("/privacy")}) · [Terms of Service](${u("/terms")})`,
    "",
  ];

  if (pricing?.packs.length) {
    lines.push("## Pricing", "");
    for (const p of pricing.packs) lines.push(`- ${p.label}: ${p.credits} credits for ${money(p.priceCents)}`);
    const c = pricing.costs;
    const named: [string, string][] = [
      ["atsCv", "AI-written ATS CV"],
      ["optimise", "AI-tailored application"],
      ["quickMatch", "Quick Match"],
      ["unlockContact", "Employer unlocks a candidate's contact details"],
    ];
    for (const [k, label] of named) if (typeof c[k] === "number") lines.push(`- ${label}: ${c[k]} credits`);
    lines.push(`- New accounts get ${pricing.freeCredits} free credits`, "");
  }

  const sectors = groupBySector(jobs);
  if (sectors.length) {
    lines.push("## Jobs by sector", "");
    for (const g of sectors) lines.push(`- [${g.name} jobs](${u(`/jobs/sector/${g.slug}`)}): ${g.jobs.length} open`);
    lines.push("");
  }
  const cities = groupByCity(jobs);
  if (cities.length) {
    lines.push("## Jobs by town", "");
    for (const g of cities.slice(0, 15)) lines.push(`- [Jobs in ${g.name}](${u(`/jobs/location/${g.slug}`)}): ${g.jobs.length} open`);
    lines.push("");
  }

  if (jobs.length) {
    lines.push(`## Latest jobs (${jobs.length} open)`, "");
    const newest = [...jobs].sort((a, b) => (b.firstSeen ?? "").localeCompare(a.firstSeen ?? "")).slice(0, 50);
    for (const j of newest) {
      const where = [j.company && j.company !== "N/A" ? j.company : "", j.location].filter(Boolean).join(", ");
      const closes = j.expiryDate ? ` — closes ${j.expiryDate}` : "";
      lines.push(`- [${j.title}](${u(jobPath(j))})${where ? `: ${where}` : ""}${closes}`);
    }
    lines.push("");
  }

  lines.push("## Optional", "", `- [Sitemap](${u("/sitemap.xml")}): every public page and open job`, "");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
