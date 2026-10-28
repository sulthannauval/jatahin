import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
  themeColor: "#f4f6fa",
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("mf-theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Light by default. A saved choice ("mf-theme" in localStorage) is applied before first paint, so there's no flash.
    <html lang="id" data-theme="light" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
