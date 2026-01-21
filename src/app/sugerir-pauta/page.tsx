import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { SuggestionForm } from "./suggestion-form";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";

export const metadata: Metadata = {
  title: "Sugerir Pauta",
  description:
    "Sugira uma pauta ou convidado para o podcast PPT Não Compila. Queremos ouvir suas ideias!",
  alternates: {
    canonical: `${baseUrl}/sugerir-pauta`,
  },
  openGraph: {
    title: "Sugerir Pauta | PPT Não Compila",
    description:
      "Sugira uma pauta ou convidado para o podcast PPT Não Compila. Queremos ouvir suas ideias!",
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
          Tem uma ideia de pauta ou conhece alguém que seria um ótimo convidado?
          Queremos ouvir você! Preencha o formulário abaixo e nossa equipe
          avaliará sua sugestão.
        </p>
      </header>

      {/* Form */}
      <div className="mx-auto max-w-2xl">
        <SuggestionForm />
      </div>
    </Container>
  );
}
