/// <reference types="@cloudflare/workers-types" />

export interface Env {
  AI: Ai;
  JOBS_CACHE: KVNamespace;
  CV_BUCKET?: R2Bucket; // optional — only bound when R2 is enabled
  DEFAULT_SCRAPE_URL: string;
  SERPER_API_KEY?: string;
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
