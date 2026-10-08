import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-grotesk" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

const baseUrl = process.env.HOTSITE_BASE_URL || "https://5anos.pptnaocompila.com.br";

// Prévia do WhatsApp (quadro 13): genérica, igual para todos — não leva nome de ninguém.
export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "5 anos de PPT Não Compila",
  description: "Convite pessoal · 05/11 · Quinta-feira · São Paulo",
  robots: { index: false, follow: false },
  openGraph: {
    title: "5 anos de PPT Não Compila",
    description: "Convite pessoal · 05/11 · Quinta-feira · São Paulo",
    images: [{ url: "/og.jpg?v=0511", width: 1200, height: 630, alt: "5 anos de PPT Não Compila · 05/11" }],
    type: "website",
    locale: "pt_BR",
  },
  twitter: { card: "summary_large_image", images: ["/og.jpg?v=0511"] },
};

export const viewport: Viewport = { themeColor: "#0C0C10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${grotesk.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
