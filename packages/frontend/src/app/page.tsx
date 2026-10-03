import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { JsonLd } from "@/components/JsonLd";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({ title: "Jobs in Zimbabwe", description: DEFAULT_DESCRIPTION, path: "/" }),
  // The home page keeps the full brand title (no "· VacancyPal" suffix).
  title: { absolute: "VacancyPal — Jobs in Zimbabwe, ATS-friendly CVs & one-swipe applications" },
};

const structured = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/icon-512.png`,
    description: DEFAULT_DESCRIPTION,
    areaServed: { "@type": "Country", name: "Zimbabwe" },
    email: "support@vacancypal.co.zw",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#organization` },
    // Lets Google show a search box for the site in results.
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/jobs?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={structured} />
      <LandingPage />
    </>
  );
}
