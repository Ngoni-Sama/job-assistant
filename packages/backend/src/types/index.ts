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
