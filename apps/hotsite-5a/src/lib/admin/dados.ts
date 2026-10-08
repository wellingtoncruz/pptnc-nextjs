import { ESPERA_COLLECTION, getFirestoreClient, GUESTS_COLLECTION } from "../firestore";
import { GuestDocSchema, fromFirestore, type GuestDoc } from "../guests/schema";

/** Leitura do painel (32.9): convites inteiros + count() da espera. Só leitura. */
export async function lerDadosPainel(): Promise<{ docs: GuestDoc[]; comProblema: number; espera: number }> {
  const db = await getFirestoreClient();
  const [snap, espera] = await Promise.all([
    db.collection(GUESTS_COLLECTION).get(),
    db.collection(ESPERA_COLLECTION).count().get(),
  ]);
  const docs: GuestDoc[] = [];
  let comProblema = 0;
  for (const s of snap.docs) {
    const r = GuestDocSchema.safeParse(fromFirestore(s.data()));
    if (r.success) docs.push(r.data);
    else {
      comProblema++;
      console.warn("[ADMIN] documento fora do schema", s.id);
    }
  }
  return { docs, comProblema, espera: espera.data().count };
}
