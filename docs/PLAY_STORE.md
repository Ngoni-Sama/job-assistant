# Publishing VacancyPal on Google Play

VacancyPal ships to Android as a **Trusted Web Activity (TWA)**: a thin Android
app that opens vacancypal.co.zw full-screen in Chrome. Website deploys update the
app instantly. You only re-upload to Play when the Android shell itself changes
(new icon, new target API, new version).

Same Play Console account as MoLeads ("NGONIDZASHE MAPHOSA"). MoLeads went straight
to a production release, so VacancyPal can too. If Play Console ever says production
is locked, run a closed test with 12+ testers for 14 days first.

---

## 0. Before you start (server)

Deploy the build that contains this guide, then check these load:

- https://vacancypal.co.zw/privacy
- https://vacancypal.co.zw/terms
- https://vacancypal.co.zw/delete-account
- https://vacancypal.co.zw/manifest.webmanifest
- https://vacancypal.co.zw/.well-known/assetlinks.json → JSON naming `zw.co.vacancypal.app`

If the assetlinks URL shows a 404 or a cPanel page, cPanel is serving its own
`.well-known` folder. Copy the JSON from https://vacancypal.co.zw/api/assetlinks into
`~/domains/vacancypal.co.zw/public_html/.well-known/assetlinks.json`.

## 1. The Android project (already built)

Lives outside this repo at `C:\Users\User\projects\vacancypal-android` (Bubblewrap).

| Setting | Value |
|---|---|
| Package ID | `zw.co.vacancypal.app` (**permanent**, can never change after upload) |
| App name / launcher name | `VacancyPal` |
| Version | `1.0.0` / code `1` (bump both in `make-manifest.js` for every upload) |
| Start URL | **`/?source=twa`**: tells the site it runs in the app, which hides buying credits |
| Notification delegation | On (job alerts, employer messages) |
| Location delegation | On (Jobs near me) |
| Play Billing | Off |
| minSdk / targetSdk | 24 / 36 |
| Upload key | `keys\vacancypal-upload.jks`, alias `vacancypal`, password in `keys\KEYSTORE-PASSWORD.txt` |

**Back up the `keys` folder** (password manager + offline copy). Losing the upload
key means a Play support ticket to reset it.

Rebuild (PowerShell, from `vacancypal-android`):

```powershell
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
$env:JAVA_HOME = "C:\Tools\jdk17"; $env:ANDROID_HOME = "C:\Tools\android-sdk"
node make-manifest.js                      # after bumping the version in it
bubblewrap update --skipVersionUpgrade     # regenerates app/ from twa-manifest.json
.\gradlew.bat bundleRelease
$env:KS_PASS = Get-Content keys\KEYSTORE-PASSWORD.txt
& "$env:JAVA_HOME\bin\jarsigner.exe" -keystore keys\vacancypal-upload.jks -storepass:env KS_PASS `
  -signedjar vacancypal-<version>.aab app\build\outputs\bundle\release\app-release.aab vacancypal
```

(Bubblewrap's own signing step fails on this machine, so sign with jarsigner.)

## 2. Create the app in Play Console

1. **Create app**: name `VacancyPal`, language English (UK), **App**, **Free**.
2. **Test and release → Production → Create new release**. Upload
   `vacancypal-1.0.0.aab`. Play App Signing is on by default; keep it on.
3. **Test and release → Setup → App integrity → App signing**: copy the SHA-256 of
   the **App signing key certificate**. Add it to `FINGERPRINTS` in
   `packages/frontend/src/app/api/assetlinks/route.ts` (the upload key is already
   there), then build and deploy. Or set it on the server without a rebuild:

   ```
   ANDROID_SHA256_CERT_FINGERPRINTS=<app-signing-sha256>,<upload-key-sha256>
   ```

   If the installed app shows a browser URL bar at the top, this step isn't working yet.

## 3. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://vacancypal.co.zw/privacy` |
| App access | **All or some functionality is restricted** → instructions: "Tap Sign in, then Continue with Google and sign in with any Google account. No invitation or code is needed. New accounts get free credits to try the AI CV tools." Use a dedicated reviewer Gmail if Play asks for a username/password, never an admin account. |
| Ads | **No ads** |
| Content rating | IARC questionnaire: category **Utility/Productivity**; users **can interact** (employers and candidates message each other); no violence, gambling, etc. Location is shared only as a city name. |
| Target audience | **18 and over** |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | No |
| Data safety | See below |
| Account deletion | URL `https://vacancypal.co.zw/delete-account` (also in the app: Settings → Delete account) |

### Data safety answers

- Data **encrypted in transit**: **Yes**. Users can **request deletion**: **Yes**.
- **Shared with third parties**: **No**. Hosting (Cloudflare), AI processing (OpenAI,
  Anthropic, Cloudflare Workers AI), Pesepay, Google (sign-in, Gmail sending, push
  delivery) and BigDataCloud (city lookup) act on our behalf. An application a user
  chooses to send to an employer is user-initiated. Neither counts as sharing.

| Data type | Collected | Required? | Ephemeral? | Purposes |
|---|---|---|---|---|
| Personal info → Name | Yes | Required | No | Account management, App functionality |
| Personal info → Email address | Yes | Required | No | Account management, App functionality |
| Personal info → User IDs | Yes | Required | No | Account management |
| Personal info → Address (home town or city in the profile) | Yes | Optional | No | App functionality |
| Personal info → Other info (work history, education, skills, availability; employer verification documents) | Yes | Optional | No | App functionality, Fraud prevention/security |
| Location → Precise location (Jobs near me "Find my location") | Yes | Optional | **Yes**: turned into a city name, coordinates never stored | App functionality |
| Files and docs (uploaded CVs) | Yes | Optional | No | App functionality |
| Messages → Emails (applications sent from the user's Gmail) | Yes | Optional | No | App functionality |
| Messages → Other in-app messages (employer ↔ candidate chat) | Yes | Optional | No | App functionality |
| Device or other IDs (push notification address) | Yes | Optional, only if notifications are on | No | App functionality |
| Financial info → Purchase history (credit top-ups and spending) | Yes | Required | No | App functionality |
| App activity → App interactions (saved jobs, swipes, applications) | Yes | Required | No | App functionality, Personalisation |
| App activity → Other user-generated content (CVs built in the app, cover notes) | Yes | Optional | No | App functionality |

Not collected: phone number (unless the user types it into their own CV), contacts,
photos, audio, health, payment card details (Pesepay handles those on its own page,
on the website only).

## 4. Store listing (Grow → Store presence → Main store listing)

- **App name:** `VacancyPal`
- **Short description (80 max):**
  `Find jobs in Zimbabwe, get matched to your CV and apply with an ATS-ready CV.`
- **Full description:**

```
VacancyPal finds the jobs that fit you and helps you apply properly.

FIND THE RIGHT JOBS
- Fresh vacancies from across Zimbabwe, updated daily
- Every job scored against your CV, so the best matches come first
- Swipe through matches: right to save, left to skip
- Jobs near me: see what's open in your town
- Job alerts the moment a job in your field is posted

APPLY WITH A BETTER CV
- ATS CV Creator: build a clean, recruiter-friendly CV with a free ATS score
- Let AI interview you: answer a few questions and get a finished CV
- Tailor your CV and cover note to any job in one tap
- Send applications from your own Gmail and track every one

GET FOUND BY EMPLOYERS
- Choose to be visible to approved, verified employers
- Employers message you in the app; report and block tools keep it safe

New accounts start with free credits to try the AI tools.
```

- **App icon:** `store/play-icon-512.png`
- **Feature graphic:** `store/play-feature-1024x500.png`
- **Phone screenshots** (1080x1920, in-app mode), upload in this order:
  `store/play/01-dashboard.png`, `02-jobs.png`, `03-job.png`, `04-swipe.png`,
  `05-cv-creator.png`, `06-near-me.png`, `07-pricing.png`
- **Category:** Business. **Tags:** Jobs, Careers.
- **Contact email:** support@vacancypal.co.zw. **Website:** https://vacancypal.co.zw

## 5. Countries and review

- **Production → Countries/regions:** Zimbabwe (add South Africa, Zambia, Botswana later if wanted).
- **Publishing overview → Send for review.** Approval usually takes 1–7 days.

## 6. Rules to keep once live

- **Never show buying inside the app**: no "Buy credits" buttons, pack prices, or
  "top up on our website" text. Anything purchase-related gets the `web-only`
  class; the site hides it when `<html data-app="android">` (set from
  `/?source=twa` via the `vp_app` cookie, see `src/lib/inApp.ts`). Spending and
  showing the balance is fine.
- Review **Admin → Moderation → Reports** regularly. Play expects reported
  conversations to be handled promptly.
- Keep `/privacy`, `/terms` and `/delete-account` public and working. Update the
  Data safety form if you start collecting something new.
- Play raises the target API level every year. Bump the version, rebuild with the
  newer target and upload.
