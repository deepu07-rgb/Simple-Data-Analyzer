import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pragya Data Studio",
  description: "Offline-first bilingual worksheet intelligence, analytics, visualization, formulas, and reporting for government and business teams.",
  keywords: ["data analysis", "dashboard", "Excel alternative", "Hindi analytics", "offline reporting"],
  authors: [{ name: "Neeraj Purohit" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "Pragya Data Studio",
    description: "Guided bilingual analytics without complex formulas.",
    siteName: "Pragya Data Studio",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pragya Data Studio",
    description: "Guided bilingual analytics without complex formulas.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
