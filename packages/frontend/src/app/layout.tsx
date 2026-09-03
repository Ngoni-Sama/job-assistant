import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Job Assistant — Sit back, relax, let AI apply for you",
  description:
    "Carefully selected jobs, AI-tailored CVs, and one-swipe applications. Built for job seekers in Zimbabwe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans">
        <Providers>
          <div className="min-h-screen">
            <Nav />
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          </div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
