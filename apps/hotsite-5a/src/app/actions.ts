"use server";

import { codigoValido, normalizarCodigo } from "@/lib/guests/codigo";
import { firestoreGuestStore } from "@/lib/guests/store";
import { executarAcao, type Acao } from "@/lib/acoes";
import type { ResultadoAcao } from "@/lib/convite";
import type { DadosConfirmacao } from "@/lib/guests/rules";
import { inscrever, type DadosEspera, type ResultadoEspera } from "@/lib/espera/espera";
import { firestoreEsperaStore } from "@/lib/espera/store";

async function rodar(codigoBruto: string, acao: Acao): Promise<ResultadoAcao> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigoValido(codigo)) return { ok: false, erro: "CODIGO_INVALIDO" };
  return executarAcao(firestoreGuestStore, codigo, acao, new Date());
}

export async function confirmarPresenca(codigo: string, dados: DadosConfirmacao): Promise<ResultadoAcao> {
  return rodar(codigo, { tipo: "confirmar", nome: dados?.nome, email: dados?.email, celular: dados?.celular });
}

export async function recusarPresenca(codigo: string): Promise<ResultadoAcao> {
  return rodar(codigo, { tipo: "recusar" });
}

export async function salvarAcompanhante(codigo: string, nome: string): Promise<ResultadoAcao> {
  return rodar(codigo, { tipo: "acompanhante", nome });
}

/** Lista de espera (32.7): só cria documento novo, nunca lê nem altera convites. */
export async function entrarNaListaDeEspera(dados: DadosEspera): Promise<ResultadoEspera> {
  return inscrever(firestoreEsperaStore, dados ?? {}, new Date());
}
