/// <reference types="@cloudflare/workers-types" />

export interface Env {
  AI: Ai;
  JOBS_CACHE: KVNamespace;
  CV_BUCKET?: R2Bucket; // optional — only bound when R2 is enabled
  DEFAULT_SCRAPE_URL: string;
  SERPER_API_KEY?: string;
  RESEND_API_KEY?: string; // optional — enables real application email sending
  APPLY_FROM_EMAIL?: string; // verified sender for Resend
  ADMIN_EMAILS?: string; // comma-separated allowlist of admin user emails
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  postedDate: string;
  description: string;
  requirements: string[];
  applyLink: string;
  source: string;
  jobType?: string; // e.g. "Full Time", "Contract"
  expiryDate?: string; // ISO yyyy-mm-dd, when known
  sector?: string; // classified sector, e.g. "IT & Software", "Healthcare"
}

/** A user-configurable place to scrape jobs from. */
export interface ScrapeSource {
  url: string;
  label: string;
  enabled: boolean;
}

export interface ScrapeStats {
  total: number;
  byLocation: Record<string, number>;
  bySource: Record<string, number>;
  scrapedAt: string;
}

/** Parsed "How to Apply" info from a job's detail page. */
export interface JobDetail {
  description: string;
  applyText: string;
  applyEmail?: string;
  applyPhone?: string;
  deadline?: string; // raw phrase, e.g. "7th September 2026"
  deadlineDate?: string; // ISO when parseable
}

/** A prepared application awaiting send/confirmation. */
export interface Application {
  jobId: string;
  jobTitle: string;
  company: string;
  to?: string; // application email, when detected
  phone?: string;
  deadline?: string;
  applyText: string; // raw "How to Apply" instructions
  subject: string;
  coverNote: string;
  tailoredCV: string;
  generatedAt: string;
  sent?: boolean;
  sentAt?: string;
  method?: "email" | "manual"; // how it was (or must be) delivered
}

/** Per-user preferences. */
export interface Prefs {
  autoApply: boolean;
  categories: string[]; // job types the user cares about
}

export interface JobScore {
  jobId: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
}

export interface StoredCV {
  key: string;
  fileName: string;
  markdown: string;
  uploadedAt: string;
}
