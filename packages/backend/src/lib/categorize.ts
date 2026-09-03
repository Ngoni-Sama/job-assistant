/**
 * Classify a job into a broad sector from its title + description. First match
 * wins, so more specific sectors are listed before catch-alls. Returns "Other"
 * when nothing matches.
 */
const SECTORS: [string, RegExp][] = [
  // NOTE: no bare "it" token here — "it" appears in almost every description and
  // caused false positives. The IT abbreviation is handled title-only below.
  ["IT & Software", /\b(software|developer|programm|web developer|full[- ]?stack|front[- ]?end|back[- ]?end|devops|data (analyst|scientist|engineer)|database|network engineer|cyber|qa engineer|it support|it officer|systems administrator)\b/i],
  ["Healthcare", /\b(nurse|nursing|medical|doctor|clinic|health|pharmac|midwife|laborator|radiograph|dental|care ?giver|physio)\b/i],
  ["Education", /\b(teacher|lecturer|tutor|school|educat|instructor|trainer|academic|zimsec|hexco|headmaster|headmistress)\b/i],
  ["Finance & Accounting", /\b(account|finance|financial|audit|bookkeep|payroll|\btax\b|treasur|bank|credit|actuar)\b/i],
  ["Engineering", /\b(engineer|mechanic|electric|technician|fitter|welder|artisan|maintenance|plumber|boilermaker|millwright)\b/i],
  ["Sales & Marketing", /\b(sales|marketing|brand|business development|merchandis|retail|promoter|telesales)\b/i],
  ["Human Resources", /\b(human resource|\bhr\b|recruit|talent acquisition)\b/i],
  ["Legal", /\b(legal|lawyer|attorney|paralegal|conveyanc|compliance officer)\b/i],
  ["Agriculture", /\b(agri|farm|crop|livestock|horticultur|irrigation|agronom)\b/i],
  ["Construction", /\b(construction|civil|builder|quantity surveyor|architect|site agent|foreman)\b/i],
  ["Hospitality & Tourism", /\b(hospitality|hotel|chef|waiter|waitress|tourism|catering|housekeep|barman)\b/i],
  ["Logistics & Transport", /\b(driver|logistic|supply chain|warehouse|procurement|fleet|transport|dispatch)\b/i],
  ["NGO & Development", /\b(ngo|humanitarian|programme officer|monitoring and evaluation|\bm&e\b|donor|community development)\b/i],
  ["Administration", /\b(admin|clerk|secretary|receptionist|office assistant|data entry|attach(e|é)e?|intern\b)\b/i],
];

export function categorize(title: string, description: string): string {
  // Uppercase IT/ICT is a strong, unambiguous signal — but only in the title,
  // and case-sensitively (so it never matches the lowercase word "it").
  if (/\b(IT|ICT)\b/.test(title)) return "IT & Software";

  // Title is the most reliable field — classify on it first, then fall back to
  // the description for generic titles ("Graduate Trainee").
  for (const [sector, re] of SECTORS) if (re.test(title)) return sector;
  for (const [sector, re] of SECTORS) if (re.test(description)) return sector;
  return "Other";
}
