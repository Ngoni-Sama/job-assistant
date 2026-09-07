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
}

export interface AppConfig {
  aiProvider: "workers-ai" | "openai";
  openaiApiKey?: string;
  openaiModel: string;
  features: {
    vacancymail: boolean;
    jobszimbabwe: boolean;
    googleJobs: boolean;
    autoApplyAllowed: boolean;
  };
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
}

export interface ThreadSummary {
  id: string;
  withName: string;
  lastMessage: string;
  updatedAt: string;
  unreadFrom: "employer" | "candidate" | null;
}

export interface CandidateCard {
  id: string;
  name: string;
  headline: string;
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
