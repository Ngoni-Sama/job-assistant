# Deploying Job Assistant

Two deploys: the **Worker** (backend) goes to Cloudflare, the **Next.js app** (frontend) goes to Vercel.

Run these from your own terminal — they need an interactive browser login.

---

## 1. Backend → Cloudflare Workers

```bash
cd packages/backend

# One-time browser login
npx wrangler login

# Create the KV namespace (already done — id is committed in wrangler.toml)
npx wrangler kv namespace create JOBS_CACHE

# Deploy
npx wrangler deploy
```

### R2 is optional

R2 stores the raw uploaded PDF. The app doesn't need it — the Markdown it matches
against is cached in KV. R2 is commented out in `wrangler.toml`, so **deploy works
without it**. To enable it later: turn on R2 in the Cloudflare dashboard (R2 → accept
terms), then `npx wrangler r2 bucket create job-assistant-cvs` and uncomment the
`[[r2_buckets]]` block.

You'll get a URL like `https://job-assistant.<your-subdomain>.workers.dev`. Verify it:

```bash
curl https://job-assistant.<your-subdomain>.workers.dev/api/health
# {"ok":true,"service":"job-assistant"}
```

Optional — enable Google Jobs search:

```bash
npx wrangler secret put SERPER_API_KEY
```

Optional — enable **real** application email sending (off by default; without it,
applications are prepared as a prefilled `mailto:` for the user to send):

```bash
npx wrangler secret put RESEND_API_KEY      # from resend.com
npx wrangler secret put APPLY_FROM_EMAIL    # a Resend-verified sender address
```

> ⚠️ With these set and a user's **auto-apply** preference on, the Worker will
> email applications to employers automatically. Leave them unset to keep a human
> in the loop.

### Why this can't run fully offline

`env.AI` (Workers AI) has **no local emulator**. `wrangler dev` opens a proxy session to
Cloudflare's servers, so you must be logged in even for local development. KV and R2 *do*
simulate locally.

---

## 2. Frontend → Vercel

> **Cloudflare Pages will not host this as-is.** Next.js 16 App Router needs the
> `@opennextjs/cloudflare` adapter to run on Cloudflare. Vercel is the zero-config path.

```bash
cd packages/frontend
npx vercel login
npx vercel --prod
```

When prompted, accept the detected Next.js settings. Then point it at your Worker:

```bash
npx vercel env add NEXT_PUBLIC_API_URL production
# paste: https://job-assistant.<your-subdomain>.workers.dev

npx vercel --prod    # redeploy so the env var takes effect
```

### Monorepo note

This repo uses npm workspaces. If you connect the GitHub repo through the Vercel
dashboard instead of the CLI, set **Root Directory** to `packages/frontend` in project
settings, otherwise the build will fail.

---

## 3. Lock down CORS

The Worker currently allows any origin (`Access-Control-Allow-Origin: *`), which is fine
for local development but too open for production. Once you know your Vercel URL, edit
`packages/backend/src/lib/utils/cors.ts` and replace `*` with that origin, then redeploy.

---

## Deploy checklist

- [ ] `wrangler login` done
- [ ] KV namespace created, real id pasted into `wrangler.toml`
- [ ] R2 bucket `job-assistant-cvs` created
- [ ] Worker deployed, `/api/health` returns ok
- [ ] Frontend deployed to Vercel
- [ ] `NEXT_PUBLIC_API_URL` set to the Worker URL, redeployed
- [ ] CORS narrowed to the Vercel origin
