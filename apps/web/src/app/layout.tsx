import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/layout/header";
import { Sponsors } from "@/components/layout/sponsors";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "PPT Não Compila - Podcast de Tecnologia e Transformação Digital",
    template: "%s | PPT Não Compila - Podcast de Tecnologia",
  },
  description:
    "PPT Não Compila é o podcast de tecnologia brasileiro com +200 episódios sobre transformação digital, carreira tech, IA e inovação. Ouça agora!",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "PPT Não Compila",
    title: "PPT Não Compila - Podcast de Tecnologia e Transformação Digital",
    description: "O podcast de tecnologia brasileiro com +200 episódios sobre transformação digital, carreira tech, IA e inovação.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Podcast PPT Não Compila",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PPT Não Compila - Podcast de Tecnologia",
    description: "O podcast de tecnologia brasileiro com +200 episódios sobre transformação digital, carreira tech, IA e inovação.",
    images: ["/og-image.png"],
  },
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
    { media: "(prefers-color-scheme: dark)", color: "#f97316" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        {/* Google Analytics - only load when configured */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  var debugMode = new URLSearchParams(window.location.search).get('debug_mode') === '1';
                  gtag('config', '${GA_MEASUREMENT_ID}', {
                    page_path: window.location.pathname,
                    debug_mode: debugMode,
                  });
                `,
              }}
            />
          </>
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          <main className="flex-1 overflow-x-hidden">{children}</main>
          <Sponsors />
          <Footer />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
