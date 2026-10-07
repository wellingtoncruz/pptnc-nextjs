import { Hotsite } from "@/components/hotsite";
import { restrito } from "@/lib/convite";

export const dynamic = "force-dynamic";

/** Sem código na URL → "Acesso restrito" (D10, plano B). */
export default function Home() {
  return <Hotsite inicial={restrito()} />;
}
