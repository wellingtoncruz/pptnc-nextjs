import { confirmar, definirAcompanhante, recusar, type DadosConfirmacao } from "./guests/rules";
import type { GuestStore } from "./guests/store";
import { toView, type ResultadoAcao } from "./convite";

export type Acao =
  | ({ tipo: "confirmar" } & DadosConfirmacao)
  | { tipo: "recusar" }
  | { tipo: "acompanhante"; nome: string };

export async function executarAcao(store: GuestStore, codigo: string, acao: Acao, agora: Date): Promise<ResultadoAcao> {
  try {
    const { doc, mudanca } = await store.mutate(codigo, (d) => {
      // 32.12: convite excluído responde como código inexistente.
      if (d.status === "excluido") return { ok: false, erro: "CODIGO_INVALIDO" };
      if (acao.tipo === "confirmar") return confirmar(d, agora, acao);
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
