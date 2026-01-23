import type { Metadata } from "next";
import { Youtube, Instagram, Linkedin } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { SpotifyIcon } from "@/components/icons/social-icons";
import { EXTERNAL_LINKS } from "@/lib/constants";
import { ContactForm } from "./contact-form";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";

export const metadata: Metadata = {
  title: "Contato - Fale com o Podcast de Tecnologia",
  description:
    "Entre em contato com a equipe do podcast de tecnologia PPT Não Compila. Parcerias, patrocínios ou para trocar uma ideia sobre tech.",
  alternates: {
    canonical: `${baseUrl}/contato`,
  },
  openGraph: {
    title: "Contato | PPT Não Compila - Podcast de Tecnologia",
    description:
      "Entre em contato com a equipe do podcast de tecnologia PPT Não Compila. Parcerias, patrocínios ou para trocar uma ideia sobre tech.",
  },
};

const socialLinks = [
  {
    name: "YouTube",
    href: EXTERNAL_LINKS.youtube,
    icon: Youtube,
    description: "Assista aos episódios completos",
    color: "hover:text-red-500",
  },
  {
    name: "Spotify",
    href: EXTERNAL_LINKS.spotify,
    icon: SpotifyIcon,
    description: "Ouça onde quiser",
    color: "hover:text-green-500",
  },
  {
    name: "Instagram",
    href: EXTERNAL_LINKS.instagram,
    icon: Instagram,
    description: "Conteúdo exclusivo e bastidores",
    color: "hover:text-pink-500",
  },
  {
    name: "LinkedIn",
    href: EXTERNAL_LINKS.linkedin,
    icon: Linkedin,
    description: "Conteúdo profissional",
    color: "hover:text-blue-500",
  },
];

export default function ContatoPage() {
  return (
    <Container className="py-8 lg:py-12">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          Contato
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Quer falar sobre tecnologia, propor uma parceria ou tirar dúvidas sobre
          o podcast? Use o formulário abaixo ou nos siga nas redes sociais.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Contact Form */}
        <div>
          <h2 className="mb-6 text-xl font-semibold text-primary">
            Envie uma mensagem
          </h2>
          <ContactForm />
        </div>

        {/* Social Links */}
        <div>
          <h2 className="mb-6 text-xl font-semibold text-primary">
            Redes Sociais
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Card className="flex flex-col items-center gap-3 p-6 text-center transition-colors hover:bg-muted/50">
                  <social.icon
                    className={`h-10 w-10 transition-colors ${social.color}`}
                  />
                  <div>
                    <p className="font-medium group-hover:text-primary">
                      {social.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {social.description}
                    </p>
                  </div>
                </Card>
              </a>
            ))}
          </div>

          {/* Email info */}
          <Card className="mt-6 p-6">
            <h3 className="mb-2 font-semibold">Email direto</h3>
            <p className="text-muted-foreground">
              Prefere email? Escreva para{" "}
              <a
                href="mailto:podcast@pptnaocompila.com.br"
                className="text-primary hover:underline"
              >
                podcast@pptnaocompila.com.br
              </a>
            </p>
          </Card>
        </div>
      </div>
    </Container>
  );
}
