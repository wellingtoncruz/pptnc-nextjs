import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { SuggestionForm } from "./suggestion-form";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";

export const metadata: Metadata = {
  title: "Sugerir Pauta para o Podcast de Tecnologia",
  description:
    "Sugira uma pauta para o podcast de tecnologia PPT Não Compila. Queremos ouvir suas ideias sobre IA, cloud, carreira tech e transformação digital!",
  alternates: {
    canonical: `${baseUrl}/sugerir-pauta`,
  },
  openGraph: {
    title: "Sugerir Pauta | PPT Não Compila - Podcast de Tecnologia",
    description:
      "Sugira uma pauta para o podcast de tecnologia PPT Não Compila. Queremos ouvir suas ideias sobre IA, cloud, carreira tech e transformação digital!",
  },
};

export default function SugerirPautaPage() {
  return (
    <Container className="py-8 lg:py-12">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          Sugerir Pauta
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Tem uma ideia de pauta sobre tecnologia ou conhece alguém que seria um
          ótimo convidado? Queremos ouvir você! Sugestões sobre IA, cloud, carreira
          tech, transformação digital e inovação são muito bem-vindas.
        </p>
      </header>

      {/* Form */}
      <div className="mx-auto max-w-2xl">
        <SuggestionForm />
      </div>
    </Container>
  );
}
