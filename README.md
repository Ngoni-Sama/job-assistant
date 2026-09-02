# 📋 Job Assistant

A smart job discovery & application tool. It scrapes job listings, converts your CV (PDF → Markdown) with Cloudflare Workers AI, scores each job against your CV, and prepares pre-filled applications for your review.

> Built as a full-stack, AI-integrated demonstration project. Human stays in the loop — the system stops at **"application prepared"** and never auto-submits.

## Architecture

```
Cloudflare Worker (backend)                Next.js (frontend)
├── /api/upload-cv   PDF → Markdown (AI)    ├── /upload     CV upload
├── /api/scrape      job scraping           ├── /dashboard  matches
├── /api/jobs        list jobs              ├── /jobs       job detail
└── /api/match       AI CV↔job scoring      └── /settings   preferences
        │                                            │
   KV (cache) · R2 (CVs) · Workers AI ◄──────────────┘
```

## Monorepo layout

```
job-assistant/
├── packages/
│   ├── backend/     Cloudflare Worker (TypeScript, no framework)
│   └── frontend/    Next.js 15 App Router + Tailwind
└── package.json     npm workspaces
```

## Getting started

```bash
npm install

# Frontend (http://localhost:3000)
npm run dev

# Backend Worker (http://localhost:8787) — separate terminal
npm run dev:api
```

### Backend configuration

1. Copy `packages/backend/.dev.vars.example` → `packages/backend/.dev.vars` and fill values.
2. Create the KV namespace and R2 bucket, then paste their IDs into `packages/backend/wrangler.toml`:
   ```bash
   cd packages/backend
   npx wrangler kv namespace create JOBS_CACHE
   npx wrangler r2 bucket create job-assistant-cvs
   ```
3. Deploy:
   ```bash
   npm run deploy:api
   npx wrangler secret put SERPER_API_KEY   # optional (Google Jobs)
   ```

### Frontend configuration

Copy `packages/frontend/.env.example` → `packages/frontend/.env.local` and set
`NEXT_PUBLIC_API_URL` to your Worker URL (defaults to `http://localhost:8787`).

## Deployment

See **[DEPLOY.md](DEPLOY.md)** — the Worker goes to Cloudflare, the Next.js app to Vercel.
(Cloudflare Pages can't host the frontend without the `@opennextjs/cloudflare` adapter.)

## Security & ethics

- CVs are stored per-user in R2; secrets live only in Wrangler secrets / `.dev.vars` (gitignored).
- No automated submissions — the assistant prepares applications for human review.
- Respect target sites' terms of service and rate limits when scraping.

## License

MIT © Ngoni-Sama
