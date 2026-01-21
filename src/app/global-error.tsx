"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for errors in the root layout
 * This must render its own html/body since the root layout may have failed
 */
export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground antialiased">
        <div className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <h1 className="mb-4 text-2xl font-semibold">Algo deu errado</h1>
          <p className="mb-8 max-w-md text-muted-foreground">
            Desculpe, ocorreu um erro inesperado.
          </p>
          <Button onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </body>
    </html>
  );
}
