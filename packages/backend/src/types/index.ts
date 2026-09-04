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
  STRIPE_SECRET_KEY?: string; // Stripe secret (sk_...) for Checkout
  STRIPE_WEBHOOK_SECRET?: string; // Stripe webhook signing secret (whsec_...)
  APP_URL?: string; // frontend origin for Checkout success/cancel URLs
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

export type Availability = "looking" | "open" | "not_looking";

export type EmployerStatus = "pending" | "approved" | "rejected";

/** Employer account — must be admin-approved before browsing candidates. */
export interface Employer {
  userId: string; // the employer's email
  company: string;
  contactPerson: string;
  status: EmployerStatus;
  createdAt: string;
}

/** Privacy-safe candidate card for the employer browse (no contact details). */
export interface CandidateCard {
  id: string; // hashed id — not the email
  name: string;
  headline: string;
  sector: string;
  availability: Availability;
  location?: string;
  yearsExperience?: number;
  skills?: string[];
  education?: string;
  languages?: string[];
}

/** Candidate profile — powers discoverability in the (future) employer view. */
export interface Profile {
  availability: Availability;
  headline: string;
  sector: string;
  name?: string;
  location?: string;
  yearsExperience?: number;
  skills?: string[];
  education?: string;
  languages?: string[];
  updatedAt: string;
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
