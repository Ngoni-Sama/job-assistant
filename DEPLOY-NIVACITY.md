# Deploying VacancyPal — nivacity (production) + Cloudflare (dev/test)

```
PRODUCTION                                    DEV / TEST
vacancypal.co.zw  (nivacity, Node/Passenger)  job-assistant-frontend…vercel.app (Vercel)
        │                                             │
        ▼                                             ▼
vacancypal-api.…workers.dev  (Worker + own KV)  job-assistant.…workers.dev (Worker + KV)
```

- The **website** (Next.js, `packages/frontend`) runs on nivacity in production.
- The **API** (`packages/backend`) stays on Cloudflare in both — it needs Workers AI
  and KV — but production uses its **own Worker + KV** (`--env production`), so real
  payments and credits never mix with test data.
- Pushing to `main` still auto-deploys the **dev** Worker (GitHub Actions) and the
  **dev** frontend (Vercel). Production is deployed deliberately, below.

> 🔐 **Secrets never go in git** (this repo is public). They live in cPanel env
> vars / `.env.production` (gitignored) and `wrangler secret`. Rotate anything
> that has ever been pasted in chat.

---

## 1. Production API (Cloudflare Worker) — one-time

```bash
cd packages/backend
npx wrangler kv namespace create JOBS_CACHE --env production
# → paste the id into wrangler.toml under [[env.production.kv_namespaces]]
openssl rand -hex 32            # → this is your INTERNAL_SECRET (keep it for step 3)
npx wrangler secret put INTERNAL_SECRET --env production
npx wrangler deploy --env production
curl https://vacancypal-api.ma360-ngoni.workers.dev/api/health
```

Also set `INTERNAL_SECRET` on the **dev** Worker if you want to test top-ups there:
`npx wrangler secret put INTERNAL_SECRET`.

## 2. Pesepay

Pesepay dashboard → application **vacanypal** → copy the **Integration Key** and
**Encryption Key** (32 chars). Nothing else to configure there: the result and
return URLs are sent with every payment
(`https://vacancypal.co.zw/api/pesepay/callback` and `…/billing?ref=…`).

Payment methods offered on Pesepay's page: Visa, Mastercard, EcoCash, OneMoney
(whatever your Pesepay account has enabled). Stripe is no longer used in the UI.

## 3. nivacity — cPanel "Setup Node.js App"

1. SSH in and clone: `git clone https://github.com/Ngoni-Sama/job-assistant.git ~/vacancypal`
2. cPanel → **Setup Node.js App** → Create:
   - Node.js version: **20+** (Next.js 16 needs ≥ 20.9)
   - Application mode: **Production**
   - Application root: `vacancypal/packages/frontend`
   - Application URL: `vacancypal.co.zw`
   - Startup file: `server.js`
3. Env vars (in the cPanel UI, **or** `packages/frontend/.env.production` — see `.env.example`):

   | Var | Production value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://vacancypal-api.ma360-ngoni.workers.dev` |
   | `APP_URL`, `AUTH_URL` | `https://vacancypal.co.zw` |
   | `AUTH_SECRET` | `npx auth secret` |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
   | `PESEPAY_INTEGRATION_KEY` / `PESEPAY_ENCRYPTION_KEY` | from step 2 |
   | `WORKER_INTERNAL_SECRET` | same value as step 1's `INTERNAL_SECRET` |

   `NEXT_PUBLIC_API_URL` is baked in at **build** time — rebuild after changing it.
4. Google Cloud Console → your OAuth client → add authorised redirect URI
   `https://vacancypal.co.zw/api/auth/callback/google` (and the domain to the consent screen).
5. Deploy — in the cPanel virtualenv shell:
   ```bash
   cd ~/vacancypal/packages/frontend && bash deploy.sh
   ```
   If the build dies (CloudLinux process limits), build locally instead:
   ```powershell
   powershell -File scripts\pack-nivacity.ps1   # needs packages\frontend\.env.production
   ```
   upload `packages/frontend/vacancypal-next.tar.gz` to `~/vacancypal/packages/frontend/`, then
   `tar -xzf vacancypal-next.tar.gz && bash deploy.sh --no-build`.

## 4. First-run checklist

1. Sign in at vacancypal.co.zw with the admin email (`ADMIN_EMAILS`).
2. **Admin → Payments**: all three status rows green (Pesepay keys, Worker link, public URL);
   gateway = **Pesepay (live)**; review top-up packs and free credits.
3. **Admin → AI**: paste the OpenAI key, keep **"Use OpenAI for CV & cover-letter generation"** on.
4. **Admin → Site**: name, tagline, support email.
5. Test a real top-up with the smallest pack (card, then EcoCash). Credits land on return,
   and via Pesepay's server callback even if the tab is closed. Each payment credits once.

## Updating production

```bash
cd ~/vacancypal/packages/frontend && bash deploy.sh      # website
cd packages/backend && npx wrangler deploy --env production   # API (from your machine)
```
