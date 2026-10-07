"use server";

import { codigoValido, normalizarCodigo } from "@/lib/guests/codigo";
import { firestoreGuestStore } from "@/lib/guests/store";
import { executarAcao, type Acao } from "@/lib/acoes";
import type { ResultadoAcao } from "@/lib/convite";

async function rodar(codigoBruto: string, acao: Acao): Promise<ResultadoAcao> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigoValido(codigo)) return { ok: false, erro: "CODIGO_INVALIDO" };
  return executarAcao(firestoreGuestStore, codigo, acao, new Date());
}

export async function confirmarPresenca(codigo: string, nome?: string): Promise<ResultadoAcao> {
  return rodar(codigo, { tipo: "confirmar", nome });
}

export async function recusarPresenca(codigo: string): Promise<ResultadoAcao> {
  return rodar(codigo, { tipo: "recusar" });
}

export async function salvarAcompanhante(codigo: string, nome: string): Promise<ResultadoAcao> {
  return rodar(codigo, { tipo: "acompanhante", nome });
}
