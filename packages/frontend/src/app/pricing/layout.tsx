import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Pricing — pay as you go, no subscription",
  description:
    "Searching and applying are free. Pay only for AI features — an AI-written ATS CV costs about $2. Credit packs from $5 via EcoCash, OneMoney or card.",
  path: "/pricing",
});

// Same questions and answers as the FAQ on the page.
const FAQ = [
  ["Is there a subscription?", "No. You buy credits when you need them and spend them on any AI feature."],
  [
    "What if the AI fails?",
    "If the CV writer or AI Apply can’t give you a result, your credits go straight back to your balance.",
  ],
  [
    "Will the AI make things up on my CV?",
    "No. It only rewrites what you enter, and the app removes any job, number or skill you didn’t give it.",
  ],
  [
    "What does “ATS-friendly” mean?",
    "A simple layout with standard headings and real, selectable text, so the software many employers use to screen CVs can read every word.",
  ],
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
      {children}
    </>
  );
}
