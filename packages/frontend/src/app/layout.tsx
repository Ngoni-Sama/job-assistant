import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import { SiteBanner } from "@/components/SiteBanner";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const DESCRIPTION =
  "Carefully selected jobs, AI-tailored CVs, and one-swipe applications. Find jobs, hire talent, grow together — built for Zimbabwe.";

// Favicon (app/icon.png), Apple icon (app/apple-icon.png) and the share card
// (app/opengraph-image.png) are picked up automatically by Next.js.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || process.env.AUTH_URL || "https://vacancypal.co.zw"),
  title: "VacancyPal — Sit back, relax, let AI apply for you",
  description: DESCRIPTION,
  applicationName: "VacancyPal",
  openGraph: {
    type: "website",
    siteName: "VacancyPal",
    title: "VacancyPal — Find Jobs • Hire Talent • Grow Together",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "VacancyPal", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans">
        <Providers>
          <div className="min-h-screen">
            <SiteBanner />
            <Nav />
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          </div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
