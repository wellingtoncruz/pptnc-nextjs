import { getFirestoreClient, GUESTS_COLLECTION } from "../firestore";
import { parseGuestDoc, type GuestDoc } from "./schema";
import type { Mudanca } from "./rules";

export interface GuestStore {
  get(codigo: string): Promise<GuestDoc | null>;
  /** Lê, aplica `fn` e grava numa única transação (dois toques simultâneos não corrompem). */
  mutate(codigo: string, fn: (doc: GuestDoc) => Mudanca): Promise<{ doc: GuestDoc | null; mudanca: Mudanca | null }>;
}

export const firestoreGuestStore: GuestStore = {
  async get(codigo) {
    const db = await getFirestoreClient();
    const snap = await db.collection(GUESTS_COLLECTION).doc(codigo).get();
    return snap.exists ? parseGuestDoc(snap.data()) : null;
  },
  async mutate(codigo, fn) {
    const db = await getFirestoreClient();
    const ref = db.collection(GUESTS_COLLECTION).doc(codigo);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { doc: null, mudanca: null };
      const doc = parseGuestDoc(snap.data());
      const mudanca = fn(doc);
      if (mudanca.ok && mudanca.mudou) {
        tx.update(ref, mudanca.campos);
        return { doc: { ...doc, ...mudanca.campos }, mudanca };
      }
      return { doc, mudanca };
    });
  },
};
