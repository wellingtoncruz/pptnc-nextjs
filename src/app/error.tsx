"use client";

import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary page for runtime errors
 * This is a Client Component as required by Next.js
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console (in production, send to monitoring service)
    console.error("Application error:", error);
  }, [error]);

  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <AlertTriangle className="mb-4 h-16 w-16 text-primary" />
        <h1 className="mb-2 text-2xl font-semibold">Algo deu errado</h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          Desculpe, ocorreu um erro inesperado. Nossa equipe foi notificada.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Button onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
          <Button variant="outline" asChild>
            <a href="/">
              <Home className="mr-2 h-4 w-4" />
              Voltar ao início
            </a>
          </Button>
        </div>
      </div>
    </Container>
  );
}
