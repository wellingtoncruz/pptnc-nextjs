import type { GuestDoc } from "./schema";
import type { GuestStore } from "./store";

export const T0 = new Date("2026-10-07T12:00:00Z");

export function nominal(over: Partial<GuestDoc> = {}): GuestDoc {
  return {
    codigo: "MARIANA742",
    cotaPatrocinador: false,
    patrocinador: null,
    nome: "Mariana Albuquerque",
    primeiroNome: "Mariana",
    acompanhantePermitido: false,
    acompanhanteNome: null,
    status: "pendente",
    email: null,
    celular: null,
    empresa: null,
    convidadoEm: null,
    episodios: [
      { videoId: "a", titulo: "Primeiro", publicadoEm: "2022-03-14", views: 1000 },
      { videoId: "b", titulo: "Segundo", publicadoEm: "2023-01-01", views: 12400 },
      { videoId: "c", titulo: "Terceiro", publicadoEm: "2026-05-01", views: 6500 },
    ],
    respondidoEm: null,
    historico: [],
    criadoEm: T0,
    atualizadoEm: T0,
    ...over,
  };
}

export function cota(over: Partial<GuestDoc> = {}): GuestDoc {
  return nominal({
    codigo: "KLEVERVIP417",
    cotaPatrocinador: true,
    patrocinador: "Klever",
    nome: null,
    primeiroNome: null,
    episodios: [],
    ...over,
  });
}

/** Store em memória com a mesma semântica transacional do Firestore. */
export function memoryStore(docs: GuestDoc[]): GuestStore & { data: Map<string, GuestDoc> } {
  const data = new Map(docs.map((d) => [d.codigo, structuredClone(d)]));
  return {
    data,
    async get(codigo) {
      return data.get(codigo) ?? null;
    },
    async mutate(codigo, fn) {
      const doc = data.get(codigo);
      if (!doc) return { doc: null, mudanca: null };
      const mudanca = fn(doc);
      if (mudanca.ok && mudanca.mudou) {
        const novo = { ...doc, ...mudanca.campos };
        data.set(codigo, novo);
        return { doc: novo, mudanca };
      }
      return { doc, mudanca };
    },
  };
}
