/// <reference types="@cloudflare/workers-types" />

export interface Env {
  AI: Ai;
  JOBS_CACHE: KVNamespace;
  CV_BUCKET?: R2Bucket; // optional — only bound when R2 is enabled
  VECTORIZE?: VectorizeIndex; // optional — recruiter candidate-search index (scales beyond in-KV cosine)
  DEFAULT_SCRAPE_URL: string;
  SERPER_API_KEY?: string;
  RESEND_API_KEY?: string; // optional — enables real application email sending
  APPLY_FROM_EMAIL?: string; // verified sender for Resend
  ADMIN_EMAILS?: string; // comma-separated allowlist of admin user emails
  STRIPE_SECRET_KEY?: string; // Stripe secret (sk_...) for Checkout
  STRIPE_WEBHOOK_SECRET?: string; // Stripe webhook signing secret (whsec_...)
  APP_URL?: string; // frontend origin for Checkout success/cancel URLs
  INTERNAL_SECRET?: string; // shared secret guarding server-to-server credit endpoints (Pesepay fulfilment)
  GOOGLE_CLIENT_ID?: string; // OAuth client used to refresh tokens for auto-apply (same client as the website)
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_KEY?: string; // base64 32-byte AES key encrypting stored Google refresh tokens
  /** Cloudflare rate limiter for the job-detail endpoint (prod only; absent locally). */
  JOB_DETAIL_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
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
  logo?: string; // absolute company logo URL, when detected
  salary?: string; // e.g. "TBA", "$500"
  applyEmail?: string; // populated lazily when a detail page is viewed
  firstSeen?: string; // ISO time we first scraped this posting (≈ date posted)
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
  logo?: string;
  sections?: {
    jobDescription?: string;
    duties?: string;
    qualifications?: string;
    howToApply?: string;
    about?: string; // "About the company"
  };
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
  responded?: boolean; // employer replied (user-marked)
  auto?: boolean; // sent by the auto-apply background job
  optimised?: boolean; // whether the CV/cover note were AI-tailored (paid)
}

/** Per-user preferences. */
export interface Prefs {
  autoApply: boolean;
  categories: string[]; // job types the user cares about
  // Auto-apply targeting (the background job only applies to matching jobs).
  autoApplySectors?: string[];
  autoApplyKeywords?: string[]; // matched against the job title
  autoApplyDailyLimit?: number; // 1..20, default 5
  autoApplyUseAI?: boolean; // AI-tailor each application (costs credits)
  notify?: NotifyPrefs;
}

/** What a user can be notified about (push). */
export type NotifyType = "message" | "interest" | "jobs" | "autoApply" | "credits";

/** Notification switches. A missing key means "on". */
export interface NotifyPrefs {
  message?: boolean; // an employer / candidate messaged you
  interest?: boolean; // an employer shortlisted you or unlocked your contact
  jobs?: boolean; // new jobs matching your profession / sectors
  autoApply?: boolean; // auto-apply sent applications or needs attention
  credits?: boolean; // a credit top-up went through
  sound?: boolean; // in-app chime + device notification sound
  quietStart?: string | null; // "HH:MM" Zimbabwe time — notifications arrive silently
  quietEnd?: string | null;
}

/** One browser/device registered for push. */
export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
  ua?: string;
  at: string;
}

/** Per-user auto-apply activity log. */
export interface AutoApplyLog {
  lastRun?: string;
  lastError?: string;
  sent: { jobId: string; title: string; company: string; to: string; at: string }[];
}

export type Availability = "looking" | "open" | "not_looking";

export type CheckCategory = "Identity" | "Education" | "Background" | "Employment";
export type CheckStatus = "pending" | "cleared" | "failed";

export interface CheckType {
  id: string;
  name: string;
  category: CheckCategory;
  credits: number;
  description: string;
}

export interface CandidateCheck {
  checkId: string;
  status: CheckStatus;
  orderedAt: string;
  clearedAt?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  at: string;
}

export type EmployerStatus = "pending" | "approved" | "rejected";

/** Employer account — must be admin-approved before browsing candidates. */
export interface Employer {
  userId: string; // the employer's email
  company: string;
  contactPerson: string;
  status: EmployerStatus;
  createdAt: string;
  documentName?: string; // uploaded vetting document (stored separately)
  rejectReason?: string; // shown to the employer when rejected
}

export interface Message {
  from: "employer" | "candidate";
  text: string;
  at: string;
}

/** A conversation between an employer and a candidate. */
export interface Thread {
  id: string;
  employerUserId: string;
  employerCompany: string;
  candidateEmail: string;
  candidateName: string;
  messages: Message[];
  updatedAt: string;
  /** When each side last opened the thread (drives "Seen" and unread dots). */
  readAt?: { employer?: string; candidate?: string };
}

/** Thread summary for inbox lists. */
export interface ThreadSummary {
  id: string;
  withName: string; // the other participant's display name
  lastMessage: string;
  updatedAt: string;
  unreadFrom: Message["from"] | null;
  unread: number; // messages I haven't opened yet
}

/** Privacy-safe candidate card for the employer browse (no contact details). */
export interface CandidateCard {
  id: string; // hashed id — not the email
  name: string;
  headline: string;
  mainProfession?: string;
  sector: string;
  availability: Availability;
  location?: string;
  yearsExperience?: number;
  skills?: string[];
  education?: string;
  languages?: string[];
  verifiedCategories?: string[]; // cleared check categories, e.g. ["Identity"]
}

/** Candidate profile — powers discoverability in the (future) employer view. */
export interface Profile {
  availability: Availability;
  headline: string;
  sector: string;
  /** The one role the candidate is known for, e.g. "Registered Nurse". */
  mainProfession?: string;
  /** Up to 5 other roles they'd also take. */
  otherRoles?: string[];
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
  id: string;
  key: string;
  fileName: string;
  markdown: string;
  uploadedAt: string;
}
