import type { Metadata, Viewport } from "next";
import { Space_Grotesk, DM_Sans, JetBrains_Mono, DM_Serif_Display, VT323 } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-space-grotesk", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-dm-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-jetbrains", display: "swap" });
const dmSerif = DM_Serif_Display({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-dm-serif-display", display: "swap" });
const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-pixel", display: "swap" });

import { ConfigProvider } from "@/components/ConfigProvider";
import { DialogProvider } from "@/components/DialogProvider";

export const metadata: Metadata = {
  title: "Housie Ghar — Book on WhatsApp, Play Live",
  description: "Housie (Tambola) the easy way — book tickets through your local agent and play live.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Let the page extend under the notch / home indicator so we can reclaim that
  // space with env(safe-area-inset-*) padding (applied to the nav, frame and
  // footer in globals.css). Without this, notched phones letterbox the frame.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${mono.variable} ${dmSerif.variable} ${vt323.variable}`}>
      {/* suppressHydrationWarning lets the inline script update data-theme before React hydrates */}
      <body className="hg-root" data-theme="dark" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('hg-theme');if(t)document.body.dataset.theme=t;}catch(e){}` }} />
        {/* iOS Safari ignores the viewport meta's zoom lock and touch-action for its native
            pinch gesture; gesturestart/gesturechange are the only reliable hook to block it there.
            The touchend timer blocks the separate double-tap-to-zoom gesture. No touchmove
            listener here: a non-passive document-level touchmove handler makes the browser wait
            on it before starting native overscroll, which silences pull-to-refresh. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, { passive: false });
document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, { passive: false });
var lastTouchEnd = 0;
document.addEventListener('touchend', function(e){
  var now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
})();` }} />
        <ConfigProvider>
          <DialogProvider>
            {/* hg-app-shell carries the ticket-grid backdrop for public pages (see
                globals.css). It lives here rather than inside PublicShell because the
                "Powered by MOD" footer below is a sibling of {children} — a backdrop
                scoped to PublicShell stops at the frame and leaves that strip bare. */}
            <div className="hg-app-shell" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
              {/* Ticket-grid backdrop. CSS-drawn with repeating gradients rather than the
                  banner's 27 DOM cells because it tiles down a page of arbitrary height —
                  a 9x3 element grid stretched over a 3000px page renders three 1000px
                  cells. Colour and strength come from the same --bn-grid-* tokens the
                  banner uses, so the two agree and both follow the active skin. Hidden on
                  staff pages by the :not(:has(...)) rule in globals.css. */}
              <div className="hg-page-bloom" aria-hidden="true" />
              <div className="hg-page-grid" aria-hidden="true" />
              <div style={{ flex: 1, position: "relative" }}>
                {children}
              </div>
              <div style={{
                width: "100%",
                // Extra bottom padding clears the home indicator on notched phones;
                // env() resolves to 0 elsewhere, so this is a no-op on other devices.
                padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
                textAlign: "center",
                fontSize: "15px",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.05em",
                marginTop: "auto"
              }}>
                <span style={{ color: "#06B6D4", fontWeight: 500 }}>Powered by</span>{" "}
                <span style={{ color: "var(--text)", fontWeight: 800, textShadow: "0px 1px 2px rgba(0,0,0,0.5)" }}>MOD</span>
              </div>
            </div>
          </DialogProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
