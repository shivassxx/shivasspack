import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/features/layout/site-header";
import { SiteFooter } from "@/features/layout/site-footer";
import { Toaster } from "@/components/ui/toaster";
import { siteConfig } from "@/lib/site-config";
import { getSiteName } from "@/lib/site-name";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const name = await getSiteName();
  return {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${name} — ${siteConfig.tagline}`,
    template: `%s · ${name}`,
  },
  description: siteConfig.description,
  keywords: ["FiveM", "graphics pack", "ReShade", "ENB", "PvP", "optimization"],
  openGraph: {
    type: "website",
    siteName: name,
    title: `${name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
    title: name,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const siteName = await getSiteName();
  return (
    <html lang="tr" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-surface-950 text-zinc-200 antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent-600 focus:px-4 focus:py-2 focus:text-white"
        >
          İçeriğe atla
        </a>
        <SiteHeader siteName={siteName} />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter siteName={siteName} />
        <Toaster />
      </body>
    </html>
  );
}
