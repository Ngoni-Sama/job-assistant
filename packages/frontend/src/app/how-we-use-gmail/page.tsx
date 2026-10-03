import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H, P, List } from "@/components/LegalPage";
import { getSiteInfo } from "@/lib/server/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How VacancyPal uses Gmail — VacancyPal",
  description:
    "VacancyPal asks for one Gmail permission — to send job applications from your own Gmail, when you press Send or through Auto-apply if you switch it on.",
};

/**
 * Plain-language explanation of the gmail.send permission for users and for
 * Google's OAuth verification reviewers. Keep it in step with the Privacy
 * Policy (section 3) and the auto-apply rules in packages/backend/src/index.ts.
 */
export default async function HowWeUseGmailPage() {
  const { name, supportEmail } = await getSiteInfo();
  const mail = (
    <a href={`mailto:${supportEmail}`} className="font-medium text-brand-700 underline">
      {supportEmail}
    </a>
  );

  return (
    <LegalPage title={`How ${name} uses Gmail`} updated="3 October 2026">
      <P>
        {name} helps job seekers in Zimbabwe apply for jobs. Signing in with Google only shares your name, email
        address and profile photo. Separately — the first time you send an application from Gmail or switch on
        Auto-apply — Google asks you for one Gmail permission: <b>“Send email on your behalf” (gmail.send)</b>. It lets{" "}
        {name} send your job applications from your own Gmail address, so employers receive them from you and replies
        come straight to your inbox. We use it in exactly two ways, both of which you control.
      </P>

      <H>1. When you press Send</H>
      <P>
        On any job, you can prepare an application (a cover note with your CV attached) and review it. Nothing is sent
        until you press <b>Send</b>. {name} then sends that one email, from your Gmail, to the employer’s application
        address shown on the job advert.
      </P>

      <H>2. Auto-apply — only if you switch it on</H>
      <P>
        Auto-apply is <b>off by default</b>. If you turn it on in Settings, {name} applies for you to new jobs that
        match the choices you make, while you’re away:
      </P>
      <List
        items={[
          "You choose the sectors and/or job-title keywords to apply to. With none chosen, nothing is sent — it never applies to everything.",
          "You set a daily limit (1 to 20 applications; 5 if you don't change it). It stops when the limit is reached.",
          "It never applies to the same job twice and never emails the same employer address twice within 30 days.",
          "It only applies to jobs that list an application email address; jobs that require an online portal are skipped.",
          "Each email is a job application: a cover note plus the CV you uploaded, sent from your Gmail to the address in the job advert.",
          "It runs a few times a day (about every 3 hours).",
          "Every application it sends appears on your Applications page, marked “Auto”, and — if you turned on notifications — you get a notification saying what was sent.",
        ]}
      />
      <P>
        To work while you’re away, Auto-apply needs to keep your Google permission. Only when Auto-apply is on, we
        store an <b>encrypted</b> Google refresh token (AES-256-GCM), used for nothing except sending these
        applications. <b>Turning Auto-apply off deletes it immediately.</b>
      </P>

      <H>What we never do</H>
      <List
        items={[
          "We don't read, search or store your inbox — we can't see emails you send or receive outside VacancyPal.",
          "We don't send anything other than the job applications described above.",
          "We don't share Gmail data, use it for advertising, or sell it.",
          "We don't send Gmail data to AI services or use it to train AI models.",
        ]}
      />

      <H>Turning it off</H>
      <List
        items={[
          <>
            Switch Auto-apply off in <Link href="/settings" className="font-medium text-brand-700 underline">Settings</Link> —
            the stored permission is deleted straight away.
          </>,
          <>
            Remove {name}’s access entirely at{" "}
            <a href="https://myaccount.google.com/permissions" className="font-medium text-brand-700 underline">
              myaccount.google.com/permissions
            </a>
            . Sending stops immediately; you can still browse jobs and send applications from your own email app.
          </>,
        ]}
      />

      <H>Limited Use</H>
      <P>
        {name}’s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="font-medium text-brand-700 underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Full details are in our{" "}
        <Link href="/privacy" className="font-medium text-brand-700 underline">
          Privacy Policy
        </Link>{" "}
        (section 3). Questions: {mail}.
      </P>
    </LegalPage>
  );
}
