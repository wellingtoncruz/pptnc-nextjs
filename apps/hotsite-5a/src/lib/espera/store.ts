import { ESPERA_COLLECTION, getFirestoreClient } from "../firestore";
import type { EsperaStore } from "./espera";

/** `add()` com ID automático: um documento por envio (D24). */
export const firestoreEsperaStore: EsperaStore = {
  async add(doc) {
    const db = await getFirestoreClient();
    await db.collection(ESPERA_COLLECTION).add(doc);
  },
};
