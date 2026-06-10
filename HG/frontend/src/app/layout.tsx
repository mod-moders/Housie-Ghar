import type { Metadata } from "next";
import { Baloo_2, Outfit, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const baloo2 = Baloo_2({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-admin", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Housie Ghar — Play Together, Win Together",
  description: "The digital Housie experience for your community.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${baloo2.variable} ${outfit.variable} ${geist.variable} ${mono.variable}`}
    >
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
