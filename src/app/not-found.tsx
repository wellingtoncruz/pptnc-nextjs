import Link from "next/link";
import { Home, List } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

/**
 * Custom 404 Not Found page with styled design
 */
export default function NotFound() {
  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="mb-4 text-7xl font-bold text-primary">404</h1>
        <h2 className="mb-2 text-2xl font-semibold">Página não encontrada</h2>
        <p className="mb-8 max-w-md text-muted-foreground">
          Ops! A página que você está procurando não existe ou foi movida.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Voltar ao início
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/episodios">
              <List className="mr-2 h-4 w-4" />
              Ver episódios
            </Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
