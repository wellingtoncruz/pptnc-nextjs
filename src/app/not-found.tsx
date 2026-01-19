import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-16 md:py-24">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="mt-4 text-2xl font-semibold">Pagina nao encontrada</h2>
        <p className="mt-4 text-muted-foreground">
          A pagina que voce esta procurando nao existe ou foi movida.
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/">Voltar para Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/episodios">Ver Episodios</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
