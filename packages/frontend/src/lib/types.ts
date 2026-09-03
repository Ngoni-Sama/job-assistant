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
