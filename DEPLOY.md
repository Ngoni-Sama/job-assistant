# Deploying Job Assistant

Two deploys: the **Worker** (backend) goes to Cloudflare, the **Next.js app** (frontend) goes to Vercel.

Run these from your own terminal — they need an interactive browser login.

---

## 1. Backend → Cloudflare Workers

```bash
cd packages/backend

# One-time browser login
npx wrangler login

# Create the two storage resources
npx wrangler kv namespace create JOBS_CACHE
npx wrangler r2 bucket create job-assistant-cvs
```

`kv namespace create` prints something like:

```
[[kv_namespaces]]
binding = "JOBS_CACHE"
id = "a1b2c3d4e5f6..."
```

Copy that `id` into `wrangler.toml`, replacing `REPLACE_WITH_KV_ID`. Then:

```bash
npx wrangler deploy
```

You'll get a URL like `https://job-assistant.<your-subdomain>.workers.dev`. Verify it:

```bash
curl https://job-assistant.<your-subdomain>.workers.dev/api/health
# {"ok":true,"service":"job-assistant"}
```

Optional — enable Google Jobs search:

```bash
npx wrangler secret put SERPER_API_KEY
```

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
