import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H, P, List } from "@/components/LegalPage";
import { getSiteInfo } from "@/lib/server/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Privacy Policy — VacancyPal",
  description: "How VacancyPal collects, uses and protects your information, including data from your Google account.",
};

export default async function PrivacyPage() {
  const { name, supportEmail } = await getSiteInfo();
  const mail = (
    <a href={`mailto:${supportEmail}`} className="font-medium text-brand-700 underline">
      {supportEmail}
    </a>
  );

  return (
    <LegalPage title="Privacy Policy" updated="1 October 2026">
      <P>
        {name} (“we”, “us”) helps job seekers in Zimbabwe and Southern Africa find jobs and apply to them, and helps
        employers find candidates. This policy explains what information we collect, how we use it, and the choices
        you have. It applies to vacancypal.co.zw and our related services.
      </P>

      <H>1. Information we collect</H>
      <List
        items={[
          <>
            <b>Google account basics</b> — when you sign in with Google we receive your name, email address and profile
            photo. We use these to create and identify your account.
          </>,
          <>
            <b>Permission to send email from your Gmail</b> — if you grant it, we can send the job applications you
            choose to send, from your own Gmail address (see section 3).
          </>,
          <>
            <b>Information you give us</b> — CVs you upload or build, your profile (availability, headline, skills,
            education, location), cover notes, applications you prepare, and messages you exchange with employers.
          </>,
          <>
            <b>Employer information</b> — company name, contact person and the verification documents employers submit
            for approval.
          </>,
          <>
            <b>Payments</b> — credit top-ups are processed by Pesepay. We receive the payment reference, amount and
            status. We never see or store your card details or mobile-money PIN.
          </>,
          <>
            <b>Technical data</b> — basic logs and anonymous usage statistics needed to run, secure and improve the
            service, and cookies that keep you signed in.
          </>,
        ]}
      />

      <H>2. How we use your information</H>
      <List
        items={[
          "To run your account and show you relevant jobs.",
          "To score how well jobs match your CV and to draft tailored CVs and cover notes when you ask for it.",
          "To send applications you choose to send, and to let you track them.",
          "To let approved employers discover candidates who have chosen to be visible.",
          "To process credit top-ups and keep accurate credit balances.",
          "To keep the service secure, prevent abuse, and provide support.",
        ]}
      />

      <H>3. Google user data and Gmail</H>
      <P>
        We request only one Gmail permission: <b>“Send email on your behalf” (gmail.send)</b>. We use it for one
        purpose — to send job applications from your own Gmail account: when you press <b>Send</b> in {name}, or,
        if you switch on <b>Auto-apply</b>, automatically to jobs that match the sectors, keywords and daily limit you
        chose. We do not read, scan or store your inbox, and we cannot see emails you send or receive outside {name}.
      </P>
      <P>
        Your Google access token is kept in an encrypted session and is used only by our server to send the emails
        described above. If you turn on Auto-apply, we also store an <b>encrypted</b> Google refresh token so we can
        send while you are away; it is used for nothing else, and turning Auto-apply off deletes it immediately. You
        can revoke our access at any time at{" "}
        <a href="https://myaccount.google.com/permissions" className="font-medium text-brand-700 underline">
          myaccount.google.com/permissions
        </a>
        .
      </P>
      <P>
        <b>Limited Use disclosure:</b> {name}’s use and transfer to any other app of information received from Google
        APIs will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="font-medium text-brand-700 underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not use Google user data for advertising, we do not sell it,
        and we do not use it to train AI or machine-learning models.
      </P>

      <H>4. AI processing</H>
      <P>
        To match jobs and tailor applications, the text of your CV and of job adverts may be processed by AI services
        (Cloudflare Workers AI and, where enabled, OpenAI) acting on our behalf. Data received from Google APIs,
        including Gmail, is never sent to these AI services.
      </P>

      <H>5. When we share information</H>
      <List
        items={[
          <>
            <b>Employers</b> — if you mark yourself as available, approved employers can see your profile card (name,
            headline, skills, sector, location and verification badges). Your email address is only revealed to an
            approved employer who unlocks your contact details.
          </>,
          <>
            <b>Service providers</b> — hosting and infrastructure (Cloudflare, our web host), payments (Pesepay), sign-in
            and email (Google), and AI processing (section 4). They may use the data only to provide their service to
            us.
          </>,
          <>
            <b>Legal reasons</b> — if required by law, or to protect the rights and safety of our users or the public.
          </>,
        ]}
      />
      <P>We do not sell your personal information.</P>

      <H>6. Keeping and deleting your information</H>
      <P>
        We keep your information while your account is active. You can delete CVs at any time from the Upload page. To
        delete your account and the information linked to it, email {mail} from the address you sign in with and we
        will delete it within 30 days, except where we must keep records (for example payment records) by law.
      </P>

      <H>7. Security</H>
      <P>
        All traffic is encrypted with HTTPS, access to data is restricted, and payment details are handled by Pesepay.
        No system is perfectly secure, but we work to protect your information and will notify you of a breach where
        the law requires it.
      </P>

      <H>8. Children</H>
      <P>{name} is not intended for anyone under 16, and we do not knowingly collect their information.</P>

      <H>9. Changes to this policy</H>
      <P>
        We may update this policy. We will change the “Last updated” date above and, for significant changes, notify
        you in the app.
      </P>

      <H>10. Contact us</H>
      <P>
        Questions or requests about your privacy: {mail}. See also our{" "}
        <Link href="/terms" className="font-medium text-brand-700 underline">
          Terms of Service
        </Link>
        .
      </P>
    </LegalPage>
  );
}
