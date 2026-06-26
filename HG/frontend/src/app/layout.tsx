import type { Metadata, Viewport } from "next";
import { Space_Grotesk, DM_Sans, JetBrains_Mono, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { PlayerSync } from "@/components/PlayerSync";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-dm-serif-display", display: "swap" });

const TITLE = "Housie Ghar — Book on WhatsApp, Play Live";
const DESCRIPTION = "Housie (Tambola) the easy way — book tickets through your local agent and play live.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Housie Ghar",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/hg-logo.png", type: "image/png" },
    ],
    apple: "/hg-logo.png",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Housie Ghar",
    type: "website",
    images: [{ url: "/hg-logo-2.png", width: 185, height: 185, alt: "Housie Ghar" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#121310",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${mono.variable} ${dmSerif.variable}`}>
      {/* suppressHydrationWarning lets the inline script update data-theme before React hydrates */}
      <body className="hg-root" data-theme="dark" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('hg-theme');if(t==='light'||t==='dark')document.body.dataset.theme=t;}catch(e){}` }} />
        <PlayerSync />
        {children}
      </body>
    </html>
  );
}
