import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H, P, List } from "@/components/LegalPage";
import { getSiteInfo } from "@/lib/server/site";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Terms of Service",
  description:
    "The terms that apply when you use VacancyPal to find jobs in Zimbabwe, build a CV and apply — as a job seeker or as an employer hiring talent.",
  path: "/terms",
});

export default async function TermsPage() {
  const { name, supportEmail } = await getSiteInfo();
  const mail = (
    <a href={`mailto:${supportEmail}`} className="font-medium text-brand-700 underline">
      {supportEmail}
    </a>
  );

  return (
    <LegalPage title="Terms of Service" updated="7 October 2026">
      <P>
        These terms apply when you use {name} (vacancypal.co.zw). By creating an account or using the service you agree
        to them. If you don’t agree, please don’t use {name}.
      </P>

      <H>1. The service</H>
      <P>
        {name} gathers job adverts from Zimbabwean job boards, helps you prepare and send applications (optionally with
        AI-tailored CVs and cover notes), and lets approved employers find and contact candidates. Features may change
        over time.
      </P>

      <H>2. Your account</H>
      <List
        items={[
          "You sign in with Google and must be at least 16 years old.",
          "Keep your account secure — you are responsible for activity under it.",
          "The information in your CV and profile must be truthful and yours to share.",
        ]}
      />

      <H>3. Job listings</H>
      <P>
        Many listings come from third-party websites. We show them in good faith and link to the original source, but
        we don’t guarantee that a listing is accurate, still open, or genuine. Never pay anyone to get a job — report
        suspicious listings to {mail}.
      </P>

      <H>4. AI-generated content</H>
      <P>
        Tailored CVs, cover notes and match scores are produced with AI and may contain mistakes. Review everything
        before you send it — you are responsible for what you submit. {name} does not guarantee interviews or
        employment.
      </P>

      <H>5. Sending applications from your Gmail</H>
      <P>
        If you allow it, {name} sends applications from your own Gmail account when you press Send. If you switch on
        Auto-apply, it also applies automatically to new jobs matching the sectors, keywords and daily limit you set,
        with your uploaded CV attached — you are responsible for keeping your CV and choices accurate, and you can
        switch it off at any time. See our{" "}
        <Link href="/privacy" className="font-medium text-brand-700 underline">
          Privacy Policy
        </Link>{" "}
        for how we handle Google data.
      </P>

      <H>6. Employers</H>
      <List
        items={[
          "Employer accounts are reviewed before approval; we may decline or suspend an account at our discretion.",
          "Use candidate information only to recruit for genuine roles, keep it confidential, and follow applicable data-protection and labour laws.",
          "Do not discriminate unlawfully, ask candidates for payment, or contact them for unrelated purposes.",
        ]}
      />

      <H>7. Credits and payments</H>
      <List
        items={[
          "Some features use prepaid credits. Prices are shown on the top-up page before you pay.",
          "Payments are processed securely by Pesepay (card and mobile money).",
          "Credits have no cash value and can’t be transferred between accounts.",
          <>
            Credits are non-refundable once used. If a payment went through but your credits didn’t arrive, contact{" "}
            {mail} and we’ll fix it.
          </>,
        ]}
      />

      <H>8. Acceptable use</H>
      <P>
        Don’t misuse {name}: no fraud or impersonation, no spam, no scraping or automated abuse of the service, no
        attempts to break its security, and nothing illegal, harmful or offensive.
      </P>
      <P>
        You can report a conversation or block anyone from the menu in that chat. We review every report and may remove
        content, block messaging or close accounts that break these rules. There is zero tolerance for scams, requests for
        payment to get a job, harassment, threats, and sexual or hateful content.
      </P>
      <P>
        The {name} name, logo, design, text, software and the way listings are gathered and presented belong to {name}.
        You may share links to pages, but you may not copy, frame, mirror, resell or republish the site or its content,
        bulk-download or scrape listings or candidate profiles, use the content to train AI models, or build a copy of
        the service, without our written permission.
      </P>

      <H>9. Your content</H>
      <P>
        You own the CVs and other content you upload. You give us permission to store and process it as needed to run
        the service for you — for example to match jobs, tailor applications, and (if you choose) show your profile to
        approved employers.
      </P>

      <H>10. Suspension and closing your account</H>
      <P>
        We may suspend or close accounts that break these terms. You can stop using {name} at any time and ask us to
        delete your account by emailing {mail}.
      </P>

      <H>11. Disclaimers and liability</H>
      <P>
        {name} is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential
        losses, for hiring decisions made by employers, or for content on third-party job sites. Our total liability to
        you is limited to the amount you paid us in the 12 months before the claim.
      </P>

      <H>12. Governing law</H>
      <P>These terms are governed by the laws of Zimbabwe.</P>

      <H>13. Changes</H>
      <P>
        We may update these terms and will change the “Last updated” date above. Continuing to use {name} after a change
        means you accept the updated terms.
      </P>

      <H>14. Contact</H>
      <P>Questions about these terms: {mail}.</P>
    </LegalPage>
  );
}
