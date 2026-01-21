import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/layout/header";
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

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "PPTNC - PPT Não Compila",
    template: "%s | PPTNC",
  },
  description:
    "Podcast sobre tecnologia e transformação digital. Busca semântica em 200+ episódios.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "PPT Não Compila",
    title: "PPTNC - PPT Não Compila",
    description: "Podcast sobre tecnologia e transformação digital",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PPT Não Compila",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PPTNC - PPT Não Compila",
    description: "Podcast sobre tecnologia e transformação digital",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
                  gtag('config', '${GA_MEASUREMENT_ID}', {
                    page_path: window.location.pathname,
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
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
