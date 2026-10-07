import { confirmar, definirAcompanhante, recusar } from "./guests/rules";
import type { GuestStore } from "./guests/store";
import { toView, type ResultadoAcao } from "./convite";

export type Acao =
  | { tipo: "confirmar"; nome?: string }
  | { tipo: "recusar" }
  | { tipo: "acompanhante"; nome: string };

export async function executarAcao(store: GuestStore, codigo: string, acao: Acao, agora: Date): Promise<ResultadoAcao> {
  try {
    const { doc, mudanca } = await store.mutate(codigo, (d) => {
      if (acao.tipo === "confirmar") return confirmar(d, agora, acao.nome);
      if (acao.tipo === "recusar") return recusar(d, agora);
      return definirAcompanhante(d, agora, acao.nome);
    });
    if (!doc || !mudanca) return { ok: false, erro: "CODIGO_INVALIDO" };
    if (!mudanca.ok) return { ok: false, erro: mudanca.erro };
    return { ok: true, convite: toView(doc) };
  } catch (e) {
    console.error("[hotsite-5a] falha na ação", acao.tipo, codigo, e);
    return { ok: false, erro: "FALHA_TEMPORARIA" };
  }
}
