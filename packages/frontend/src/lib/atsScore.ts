/**
 * Free, instant ATS check for the CV Creator — runs in the browser, no AI.
 * Looks at the things applicant-tracking systems and recruiters screen on:
 * contact details, a summary, achievement bullets (action verbs, numbers,
 * no weak phrases), skills, education, length, and — when a job advert is
 * pasted — how many of its keywords the CV covers.
 */

export type AtsDraft = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  jobs: { role: string; company: string; start: string; end: string; bullets: string }[];
  edus: { qualification: string; institution: string }[];
  skills: string[];
  certs: string[];
};

export type AtsCheck = { id: string; label: string; points: number; max: number; tip?: string };

export type AtsReport = {
  score: number; // 0–100
  checks: AtsCheck[];
  keywords: { matched: string[]; missing: string[] } | null;
  weakFound: string[];
};

const ACTION_VERBS = new Set(
  (
    "achieved administered advised analysed analyzed arranged assessed assisted audited automated balanced booked briefed " +
    "budgeted built calculated campaigned cared catalogued chaired championed checked cleaned coached collaborated " +
    "collected communicated compiled completed composed conducted configured consolidated constructed consulted " +
    "contributed controlled converted cooked coordinated counselled counseled created cultivated cut debugged decreased " +
    "defined delivered demonstrated deployed designed developed diagnosed directed distributed doubled drafted drove " +
    "edited educated eliminated enabled engineered enhanced ensured established evaluated examined executed expanded " +
    "expedited facilitated filed finalised finalized forecast formulated founded fostered gathered generated grew guided " +
    "handled headed helped hired identified implemented improved increased influenced initiated inspected installed " +
    "instructed integrated interviewed introduced invented investigated launched led lectured liaised maintained managed " +
    "marketed mastered maximised maximized measured mentored merged migrated minimised minimized modernised modernized " +
    "monitored motivated negotiated nursed operated optimised optimized orchestrated organised organized oversaw " +
    "participated performed piloted pioneered planned prepared presented prioritised prioritized processed procured " +
    "produced programmed promoted proposed protected provided published purchased raised ran reconciled recorded " +
    "recruited redesigned reduced refined reorganised reorganized repaired reported represented researched resolved " +
    "restored restructured reviewed revised saved scheduled screened secured served serviced set simplified sold solved " +
    "sourced spearheaded standardised standardized started streamlined strengthened structured supervised supplied " +
    "supported surpassed taught tested tracked trained transformed translated treated tripled troubleshot tutored " +
    "upgraded utilised utilized validated verified volunteered won wrote " +
    // present tense, common for current roles
    "manage lead develop deliver coordinate oversee supervise prepare handle maintain support train design build plan " +
    "process provide monitor ensure implement analyse analyze teach treat serve sell negotiate administer"
  ).split(/\s+/),
);

/** Phrases that describe duties instead of results. */
const WEAK_PHRASES = [
  "responsible for",
  "duties include", // also catches "duties included"
  "tasked with",
  "in charge of",
  "helped with",
  "worked on",
  "assisted with",
  "involved in",
  "various tasks",
  "hard working",
  "hardworking",
  "team player",
  "go-getter",
];

const STOP_WORDS = new Set(
  (
    "a about above across after again against all also an and any are as at be been being below between both but by can " +
    "could did do does doing during each else etc few for from further had has have having he her here hers him his how " +
    "i if in into is it its itself just may me might more most must my no nor not now of off on once only or other our " +
    "out over own per same shall she should so some such than that the their them then there these they this those " +
    "through to too under until up upon us very via was we were what when where which while who whom why will with " +
    "within without would you your yours " +
    // job-advert filler
    "ability able apply applicant applicants application applications candidate candidates closing company date day " +
    "days deadline email excellent experience experienced good great harare bulawayo zimbabwe include includes " +
    "including job jobs key knowledge looking minimum month months new one opportunity please position post preferred " +
    "proven qualification qualifications relevant required requirement requirements responsibilities responsible role " +
    "salary send skills strong successful suitable team two well work working year years least plus advantage added " +
    "duties benefits candidates attach attached cv cvs resume interested should based know knowing understanding " +
    "familiar familiarity proficient proficiency competent demonstrated solid sound exposure hands using use"
  ).split(/\s+/),
);

const words = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9+#.-]*[a-z0-9+#]|[a-z]/g) ?? [];
const stem = (w: string) => (w.length < 5 ? w : w.slice(0, 5));
const bulletLines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);

/** The most-used meaningful words in a job advert (its likely screening keywords). */
export function advertKeywords(advert: string, max = 20): string[] {
  const counts = new Map<string, { word: string; n: number; first: number }>();
  words(advert).forEach((w, i) => {
    if (w.length < 3 || STOP_WORDS.has(w) || /^\d/.test(w)) return;
    const k = stem(w);
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { word: w, n: 1, first: i });
  });
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, max)
    .map((c) => c.word);
}

export function scoreCv(d: AtsDraft, advert = ""): AtsReport {
  const checks: AtsCheck[] = [];
  const add = (id: string, label: string, ratio: number, max: number, tip?: string) =>
    checks.push({ id, label, points: Math.round(Math.max(0, Math.min(1, ratio)) * max), max, tip: ratio >= 1 ? undefined : tip });

  const roles = d.jobs.filter((j) => j.role.trim() || j.company.trim());
  const bullets = roles.flatMap((j) => bulletLines(j.bullets));
  const allText = [
    d.name,
    d.headline,
    d.summary,
    ...roles.flatMap((j) => [j.role, j.company, j.bullets]),
    ...d.edus.flatMap((e) => [e.qualification, e.institution]),
    ...d.skills,
    ...d.certs,
  ].join("\n");
  const wordCount = words(allText).length;

  // Contact
  const contact = [d.name, d.email, d.phone, d.location].filter((v) => v.trim()).length;
  add("contact", "Name, email, phone and location", contact / 4, 10, "Add your email, phone number and town so employers can reach you.");

  add("headline", "Professional title", d.headline.trim() ? 1 : 0, 5, "Add a title like “Registered Nurse” — ATS searches match on it.");

  // Summary: 30–120 words is the sweet spot.
  const sw = words(d.summary).length;
  add(
    "summary",
    "Professional summary (30–120 words)",
    sw === 0 ? 0 : sw < 30 ? 0.5 : sw > 160 ? 0.6 : 1,
    10,
    sw === 0 ? "Add a 3–4 sentence summary of who you are and what you do best." : sw < 30 ? "Your summary is short — aim for 3–4 sentences." : "Your summary is long — keep it to 3–4 sentences.",
  );

  // Experience with dates
  const dated = roles.filter((j) => j.role.trim() && j.company.trim() && (j.start.trim() || j.end.trim())).length;
  add("experience", "Work experience with role, company and dates", roles.length ? dated / roles.length : 0, 10, "Give every role a job title, company and dates (e.g. Jan 2022 – Present).");

  const withBullets = roles.filter((j) => bulletLines(j.bullets).length >= 2).length;
  add("bullets", "2+ achievement bullets per role", roles.length ? withBullets / roles.length : 0, 10, "Add at least 2–3 lines under each role describing what you achieved.");

  // Action verbs
  const verbStart = bullets.filter((b) => ACTION_VERBS.has(words(b)[0] ?? "")).length;
  const verbRatio = bullets.length ? verbStart / bullets.length : 0;
  add("verbs", "Bullets start with action verbs", verbRatio / 0.7, 15, "Start each line with a strong verb: Led, Managed, Delivered, Improved, Trained…");

  // Quantified results
  const numbered = bullets.filter((b) => /\d/.test(b)).length;
  const numRatio = bullets.length ? numbered / bullets.length : 0;
  add("numbers", "Results with numbers", numRatio / 0.3, 10, "Add real numbers where you have them — patients per shift, % growth, $ budget, team size.");

  // Weak phrases
  const lower = allText.toLowerCase();
  const weakFound = WEAK_PHRASES.filter((p) => lower.includes(p));
  add("weak", "No weak phrases", weakFound.length === 0 ? 1 : weakFound.length === 1 ? 0.5 : 0, 10, `Replace “${weakFound[0] ?? ""}” with what you actually achieved.`);

  // Skills
  const sk = d.skills.length;
  add("skills", "5–20 skills listed", sk >= 5 && sk <= 20 ? 1 : sk === 0 ? 0 : sk < 5 ? sk / 5 : 0.7, 10, sk > 20 ? "Trim to your 20 most relevant skills." : "List at least 5 skills — ATS filters match on them.");

  add("education", "Education", d.edus.some((e) => e.qualification.trim() || e.institution.trim()) ? 1 : 0, 5, "Add your highest qualification.");

  // Length: roughly one to two pages.
  add("length", "Length (about 1–2 pages)", wordCount >= 200 && wordCount <= 900 ? 1 : wordCount < 200 ? wordCount / 200 : 0.6, 5, wordCount < 200 ? "Your CV is thin — add more detail to your roles." : "Your CV is long — keep it to two pages.");

  // Keyword coverage against the advert
  let keywords: AtsReport["keywords"] = null;
  if (advert.trim().length > 40) {
    const wanted = advertKeywords(advert);
    const have = new Set(words(allText).map(stem));
    const matched = wanted.filter((w) => have.has(stem(w)));
    const missing = wanted.filter((w) => !have.has(stem(w)));
    keywords = { matched, missing };
    add(
      "keywords",
      "Keywords from the job advert",
      wanted.length ? matched.length / wanted.length / 0.75 : 1,
      25,
      "Use the advert’s wording where it truthfully matches your experience.",
    );
  }

  const got = checks.reduce((s, c) => s + c.points, 0);
  const max = checks.reduce((s, c) => s + c.max, 0);
  return { score: Math.round((got / max) * 100), checks, keywords, weakFound };
}
