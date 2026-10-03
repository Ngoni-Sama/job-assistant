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
  jobType?: string;
  expiryDate?: string;
  sector?: string;
  logo?: string;
  salary?: string;
  applyEmail?: string;
}

export interface JobDetailFull {
  description: string;
  applyText: string;
  applyEmail?: string;
  applyPhone?: string;
  deadline?: string;
  deadlineDate?: string;
  logo?: string;
  sections?: {
    jobDescription?: string;
    duties?: string;
    qualifications?: string;
    howToApply?: string;
    about?: string;
  };
}

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

export interface Application {
  jobId: string;
  jobTitle: string;
  company: string;
  to?: string;
  phone?: string;
  deadline?: string;
  applyText: string;
  subject: string;
  coverNote: string;
  tailoredCV: string;
  generatedAt: string;
  sent?: boolean;
  sentAt?: string;
  method?: "email" | "manual";
  responded?: boolean;
  auto?: boolean; // sent by auto-apply
  optimised?: boolean;
}

export interface SendResult {
  sent: boolean;
  method: "email" | "manual";
  mailto?: string;
  reason?: string;
}

export interface Prefs {
  autoApply: boolean;
  categories: string[];
  autoApplySectors?: string[];
  autoApplyKeywords?: string[];
  autoApplyDailyLimit?: number;
  autoApplyUseAI?: boolean;
  notify?: NotifyPrefs;
}

export type NotifyType = "message" | "interest" | "jobs" | "autoApply" | "credits";

/** Notification switches. A missing key means "on". */
export interface NotifyPrefs {
  message?: boolean;
  interest?: boolean;
  jobs?: boolean;
  autoApply?: boolean;
  credits?: boolean;
  sound?: boolean;
  quietStart?: string | null; // "HH:MM", Zimbabwe time
  quietEnd?: string | null;
}

export interface AutoApplyStatus {
  allowed: boolean; // admin feature flag
  authorized: boolean; // server holds a Google token for this user
  sentToday: number;
  lastRun: string | null;
  lastError: string | null;
  recent: { jobId: string; title: string; company: string; to: string; at: string }[];
}

export interface AppConfig {
  aiProvider: "workers-ai" | "openai";
  openaiApiKey?: string;
  openaiModel: string;
  openaiForDocuments: boolean;
  features: {
    vacancymail: boolean;
    jobszimbabwe: boolean;
    googleJobs: boolean;
    autoApplyAllowed: boolean;
  };
  payments: {
    provider: "pesepay" | "stripe" | "none";
    currency: string;
    freeCredits: number;
  };
  site: {
    name: string;
    tagline: string;
    supportEmail: string;
    maintenanceMode: boolean;
  };
  packs: CreditPack[];
}

export interface SiteSettings {
  site: AppConfig["site"];
  payments: AppConfig["payments"];
}

export interface Me {
  userId: string;
  isAdmin: boolean;
}

export interface QuickMatchResult {
  jobId: string;
  title: string;
  company: string;
  location: string;
  score: number;
  reason: string;
}

export interface QuickMatchRun {
  id: string;
  createdAt: string;
  analyzedCount: number;
  results: QuickMatchResult[];
}

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceCents: number;
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

export interface Employer {
  userId: string;
  company: string;
  contactPerson: string;
  status: EmployerStatus;
  createdAt: string;
  documentName?: string;
  rejectReason?: string;
}

export interface Message {
  from: "employer" | "candidate";
  text: string;
  at: string;
}

export interface Thread {
  id: string;
  employerUserId: string;
  employerCompany: string;
  candidateEmail: string;
  candidateName: string;
  messages: Message[];
  updatedAt: string;
  readAt?: { employer?: string; candidate?: string };
}

export interface ThreadSummary {
  id: string;
  withName: string;
  lastMessage: string;
  updatedAt: string;
  unreadFrom: "employer" | "candidate" | null;
  unread?: number;
}

export interface CandidateCard {
  id: string;
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
  verifiedCategories?: string[];
}

export interface Profile {
  availability: Availability;
  headline: string;
  sector: string;
  mainProfession?: string;
  otherRoles?: string[];
  name?: string;
  location?: string;
  yearsExperience?: number;
  skills?: string[];
  education?: string;
  languages?: string[];
  updatedAt: string;
}

export interface RecruiterCv {
  id: string;
  fileName: string;
  name: string;
  headline: string;
  sector: string;
  location: string;
  uploadedAt: string;
}

export interface CandidateMatch {
  id: string;
  name: string;
  headline?: string;
  sector?: string;
  location?: string;
  skills?: string[];
  source: "platform" | "mine";
  score: number;
  reason: string;
  locked: boolean;
}

export interface RecruiterSearchResult {
  answer: string;
  matches: CandidateMatch[];
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
