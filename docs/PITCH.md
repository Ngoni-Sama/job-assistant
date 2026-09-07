# Job Assistant — Pitch & Business Model

> **A two-sided AI talent marketplace for Zimbabwe & Southern Africa.**
> Job seekers apply smarter; employers hire faster.

All hard numbers on pricing and credit costs below are pulled from the codebase
(`packages/backend/src/lib/stripe.ts` and `credits.ts`). Cost-of-goods and projection
figures are **illustrative estimates, clearly marked**, meant to be replaced with your
live vendor invoices before quoting them to investors.

---

## 1. The problem

- **Job seekers** in the region apply blindly — generic CVs, no idea if they match, and
  many have no CV at all. Good roles on scattered boards are missed or expire.
- **Employers** drown in unqualified, unverified applicants and have no fast way to reach
  active, screened candidates.

## 2. The solution

One platform, two doors:

- **"I'm looking for work"** — aggregated jobs, AI-tailored applications sent from the
  user's own Gmail, a build-from-scratch CV maker, swipe-to-match, and background-check
  verification.
- **"I'm hiring"** — a searchable pool of profiled, verifiable candidates with
  swipe-to-shortlist, pay-to-unlock contacts, and in-app messaging.

See [HOW-IT-WORKS.md](HOW-IT-WORKS.md) for the full product walkthrough.

## 3. Why now / why us

- **AI cost collapsed.** Running the tailoring model on Cloudflare Workers AI makes each
  AI action cost a fraction of a cent — margins that weren't possible two years ago.
- **Local-first.** Zimbabwean job-board coverage, USD pricing with mobile-money
  (Paynow/EcoCash) on the roadmap, and Gmail-native sending that employers trust.
- **Two-sided moat.** Every verified candidate makes the employer side more valuable, and
  every employer makes the seeker side more valuable.

---

## 4. Where the money is (revenue model)

A **prepaid credit** system. New accounts get **50 free credits**; everything metered runs
down that balance and is topped up via Stripe Checkout.

### Credit packs (live pricing)

| Pack | Credits | Price (USD) | $ / credit |
|------|--------:|------------:|-----------:|
| Starter | 100 | $5 | $0.050 |
| Standard | 300 | $12 | $0.040 |
| Pro | 1,000 | $35 | $0.035 |

### What credits are spent on (live costs)

| Action | Side | Credits | ≈ USD value* |
|--------|------|--------:|-------------:|
| **AI Apply** (tailor CV + cover note) | Seeker | 3 | $0.11–0.15 |
| **Match all jobs** to my CV | Seeker | 5 | $0.18–0.25 |
| **Quick Match** (batch analysis) | Seeker | 10 | $0.35–0.50 |
| **Unlock a candidate's contact** | Employer | 20 | $0.70–1.00 |
| **Background check** (ID / education / employment / criminal) | Seeker | 15–30 | $0.53–1.50 |

\* Using the $0.035–$0.05 per-credit range from the packs above.

**Revenue centres:**
1. **Seeker AI usage** — high volume, low ticket (AI Apply is the habit-forming action).
2. **Employer unlocks** — low volume, high ticket (the clearest willingness-to-pay).
3. **Verification** — background checks (can be resold on top of a third-party provider).
4. **Future:** employer subscriptions / featured job posts / recruiter seats.

---

## 5. Unit economics & profit

The gross margin story is driven by how cheap the AI is.

**Illustrative** cost to serve one **AI Apply** (~5k tokens: 4k in / 1k out):

| Model | Est. cost / AI Apply* | Price charged | Gross margin |
|-------|----------------------:|--------------:|-------------:|
| Cloudflare Workers AI (Llama 3.3 70B) — *current* | ~$0.003 | ~$0.12 | **~97%** |
| GPT-class "mini" model | ~$0.001–0.002 | ~$0.12 | ~98% |
| GPT-class flagship | ~$0.02 | ~$0.12 | ~83% |
| Claude Sonnet-class | ~$0.025 | ~$0.12 | ~79% |

\* **Estimates only** — recompute from current vendor rates × your real token counts.
Method: `cost = (input_tokens × input_$/Mtok + output_tokens × output_$/Mtok)`.

**Takeaway:** even a full switch to a premium model keeps AI actions ~80% margin, because
the credit price is decoupled from the model. Non-AI costs (Workers, KV, Vercel, Stripe's
~3% + $0.30) are small and mostly flat at early scale.

---

## 6. If the AI model changes (sensitivity)

The app is **provider-agnostic** (`provider.ts`): it can run Workers AI or OpenAI and fall
back automatically. Levers if model cost rises:

1. **Absorb it** — margins tolerate a flagship model (see table above).
2. **Re-price credits** — a 1-credit bump on AI Apply (3 → 4) restores margin instantly.
3. **Tier by model** — cheap default model for AI Apply; premium model as a paid "Pro
   tailoring" upsell.
4. **Cache & batch** — job-detail and match results are already cached in KV to cut
   repeat calls.

**Expected result of a model change:** cost per AI action moves from ~$0.003 to
~$0.02–0.03 in the worst case; blended gross margin stays **~80%+** with no price change,
or **~95%+** with a 1-credit adjustment.

---

## 7. Expected results (illustrative funnel)

> These are **planning assumptions to validate**, not guarantees.

**Seeker funnel (per 1,000 signups):**

| Stage | Assumed rate | Count |
|-------|-------------:|------:|
| Sign up (50 free credits) | — | 1,000 |
| Add a CV (upload or build) | 60% | 600 |
| Use a paid AI action | 25% | 250 |
| Convert to a paid top-up | 8% | 80 |

At ~$6 average first top-up → **~$480 / 1,000 signups** from seekers alone, before repeat
purchases.

**Employer side (per 20 active employers/mo):**

| Metric | Assumption |
|--------|-----------|
| Unlocks / employer / month | 10 |
| Revenue / unlock (20 cr) | ~$0.80 |
| → Monthly employer revenue | **~$160** |

**Blended illustrative month** (2,000 new seekers + 40 active employers):
~$960 seeker + ~$320 employer ≈ **~$1,280/mo revenue at ~85% gross margin**, scaling
roughly linearly with signups and employer count.

---

## 8. Roadmap to revenue

- **Now:** aggregation, AI Apply, CV builder, swipe match, employer unlock, verification,
  Stripe credits.
- **Next:** Paynow/EcoCash top-ups (local payments), employer subscriptions & featured
  posts, referral credits, WhatsApp application delivery.
- **Later:** recruiter analytics, employer ATS integrations, regional expansion (SA first).

---

## 9. One-line pitch

> *Job Assistant turns a blank page into a sent, tailored application in minutes — and
> turns that verified applicant into a hire — on margins that work because the AI is
> nearly free to run.*
