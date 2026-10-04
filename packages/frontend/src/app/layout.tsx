import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import { SiteBanner } from "@/components/SiteBanner";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { LiveUpdates } from "@/components/LiveUpdates";
import { DEFAULT_DESCRIPTION, INDEXABLE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { WORKER_BASE } from "@/lib/server/worker";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Favicon (app/icon.png), Apple icon (app/apple-icon.png) and the share card
// (app/opengraph-image.png) are picked up automatically by Next.js. Pages set
// their own title (→ "Title · VacancyPal"), description and canonical URL.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "VacancyPal — Jobs in Zimbabwe, ATS-friendly CVs & one-swipe applications",
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "jobs in Zimbabwe",
    "Zimbabwe vacancies",
    "Harare jobs",
    "Bulawayo jobs",
    "ATS CV",
    "CV builder",
    "job applications",
    "VacancyPal",
  ],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false },
  robots: INDEXABLE
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } }
    : { index: false, follow: false },
  // Search Console / Bing Webmaster verification (set the env vars, then rebuild).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_ZW",
    title: "VacancyPal — Find Jobs • Hire Talent • Grow Together",
    description: DEFAULT_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DEFAULT_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#0048c8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans">
        {/* Job data comes from the API — open the connection early. */}
        <link rel="preconnect" href={WORKER_BASE} crossOrigin="anonymous" />
        <Providers>
          <LiveUpdates>
            <div className="min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
              <SiteBanner />
              <Nav />
              <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
              <Footer />
              <BottomNav />
            </div>
          </LiveUpdates>
        </Providers>
        {/* Vercel Analytics only works on Vercel; elsewhere its script 404s. */}
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
