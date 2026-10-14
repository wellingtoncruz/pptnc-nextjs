import { Hotsite } from "@/components/hotsite";
import { getConvite } from "@/lib/convite";
import { firestoreGuestStore } from "@/lib/guests/store";

// Dinâmica por requisição: o prerender do build assaria placeholder (lição do Epic 30).
export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const view = await getConvite(decodeURIComponent(codigo), (c) => firestoreGuestStore.get(c));
  return <Hotsite inicial={view} />;
}
