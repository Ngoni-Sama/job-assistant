import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H, P, List } from "@/components/LegalPage";
import { DeleteAccount } from "@/components/DeleteAccount";
import { getSiteInfo } from "@/lib/server/site";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Delete your account",
  description: "How to delete your VacancyPal account and all the data stored with it — in the app, on the website, or by email.",
  path: "/delete-account",
});

export default async function DeleteAccountPage() {
  const { name, supportEmail } = await getSiteInfo();
  return (
    <LegalPage title={`Delete your ${name} account`} updated="7 October 2026">
      <P>You can delete your {name} account at any time. Deletion is permanent and happens straight away.</P>

      <H>Delete it now</H>
      <P>Sign in with the Google account you use for {name}, then confirm below.</P>
      <DeleteAccount />

      <H>Other ways</H>
      <List
        items={[
          `In the ${name} app or on the website: Settings → Delete account.`,
          `By email: write to ${supportEmail} from the address on your account and ask us to delete it. We do it within 7 days and confirm by email.`,
        ]}
      />

      <H>What gets deleted</H>
      <List
        items={[
          "Your profile, availability and job preferences",
          "Your CVs and uploaded CV files, and your place in employer talent search",
          "Your applications, saved and swiped jobs, and Quick Match history",
          "Your messages and conversations with employers (or candidates)",
          "Your credit balance, notification devices, and Google sign-in permissions held by us",
          "Employer accounts: your company profile and verification documents",
        ]}
      />

      <H>What we keep</H>
      <P>
        Records of payments you made (amount, date, reference) — the law requires us to keep these for accounting for up
        to 7 years. They don’t include your CV or profile. Applications you already sent from your Gmail stay in your own
        Gmail and with the employers you sent them to; we can’t delete those.
      </P>
      <P>
        Questions? See our <Link href="/privacy" className="font-medium text-brand-700 underline">Privacy Policy</Link> or
        email {supportEmail}.
      </P>
    </LegalPage>
  );
}
