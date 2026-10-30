import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Mint Signal's faces: Plus Jakarta Sans for everything, IBM Plex Mono for code only.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Jatahin!", template: "%s · Jatahin!" },
  description: "Jatahin! — Atur Jatah, Baru Belanja. Catatan keuangan pribadi: transaksi, budget, dan tabungan.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Jatahin!", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8f8",
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("mf-theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Light by default. A saved choice ("mf-theme" in localStorage) is applied before first paint, so there's no flash.
    <html lang="id" data-theme="light" suppressHydrationWarning className={`${jakarta.variable} ${plexMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
