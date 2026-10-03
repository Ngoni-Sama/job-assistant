import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "ATS CV Creator — free ATS score + AI CV writer",
  description:
    "Build an ATS-friendly CV with a free ATS score as you type, a job-advert keyword check, PDF and Word downloads, and an AI writer that never invents facts.",
  path: "/cv-builder",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "VacancyPal ATS CV Creator",
          url: `${SITE_URL}/cv-builder`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any (web browser)",
          description:
            "Build an ATS-friendly CV with a free ATS score, job-advert keyword check and PDF/Word export. Optional AI writing is paid with credits.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free to build, score and download" },
          publisher: { "@id": `${SITE_URL}/#organization` },
        }}
      />
      {children}
    </>
  );
}
