import { validarCelular, validarEmail } from "../contato";
import type { GuestDoc, HistoricoEntrada, Status } from "./schema";

/** Erros do contrato com a página (32.3 AC 7 e adendo da cota). */
export type ErroConvite =
  | "CODIGO_INVALIDO"
  | "ACOMPANHANTE_NAO_PERMITIDO"
  | "NOME_INVALIDO"
  | "NOME_OBRIGATORIO"
  | "EMPRESA_OBRIGATORIA"
  | "EMPRESA_INVALIDA"
  | "EMAIL_OBRIGATORIO"
  | "EMAIL_INVALIDO"
  | "CELULAR_INVALIDO"
  | "FALHA_TEMPORARIA";

export const NOME_MAX = 80;

/** trim + colapsa espaços; null se vazio, longo demais ou com caractere de controle. */
export function validarNome(bruto: string | null | undefined): string | null {
  if (typeof bruto !== "string") return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(bruto)) return null;
  const nome = bruto.trim().replace(/\s+/g, " ");
  if (nome.length < 1 || nome.length > NOME_MAX) return null;
  return nome;
}

export type Mudanca =
  | { ok: true; mudou: false }
  | { ok: true; mudou: true; campos: Partial<GuestDoc> }
  | { ok: false; erro: ErroConvite };

function entrada(doc: GuestDoc, agora: Date, status: Status, extra: Partial<HistoricoEntrada> = {}): HistoricoEntrada {
  return { em: agora, status, acompanhanteNome: doc.acompanhanteNome, ...extra };
}

export interface DadosConfirmacao {
  nome?: string | null;
  empresa?: string | null;
  email?: string | null;
  celular?: string | null;
}

/**
 * Confirmar: qualquer status → confirmado.
 * - Cota (D19): exige o nome enquanto ele for null; nominal ignora o nome recebido.
 * - D30: empresa obrigatória (vem preenchida pela carga; o convidado confirma ou corrige).
 * - D22: email obrigatório, celular opcional (vazio grava null). Ordem: nome → empresa → email → celular.
 * - Idempotente: já confirmado com o MESMO contato não muda nada; contato diferente atualiza
 *   e entra no histórico (D24). `respondidoEm` só muda com troca de status.
 */
export function confirmar(doc: GuestDoc, agora: Date, dados: DadosConfirmacao = {}): Mudanca {
  let nome = doc.nome;
  if (doc.cotaPatrocinador && !doc.nome) {
    if (dados.nome == null || String(dados.nome).trim() === "") return { ok: false, erro: "NOME_OBRIGATORIO" };
    nome = validarNome(dados.nome);
    if (!nome) return { ok: false, erro: "NOME_INVALIDO" };
  }
  if (dados.empresa == null || String(dados.empresa).trim() === "") return { ok: false, erro: "EMPRESA_OBRIGATORIA" };
  const empresa = validarNome(dados.empresa);
  if (!empresa) return { ok: false, erro: "EMPRESA_INVALIDA" };
  if (dados.email == null || String(dados.email).trim() === "") return { ok: false, erro: "EMAIL_OBRIGATORIO" };
  const email = validarEmail(dados.email);
  if (!email) return { ok: false, erro: "EMAIL_INVALIDO" };
  const cel = validarCelular(dados.celular);
  if (!cel.ok) return { ok: false, erro: "CELULAR_INVALIDO" };
  const celular = cel.valor;

  const trocaStatus = doc.status !== "confirmado";
  const trocaContato = email !== doc.email || celular !== doc.celular || empresa !== doc.empresa;
  if (!trocaStatus && !trocaContato) return { ok: true, mudou: false };

  const campos: Partial<GuestDoc> = {
    status: "confirmado",
    empresa,
    email,
    celular,
    atualizadoEm: agora,
    historico: [...doc.historico, entrada(doc, agora, "confirmado", { empresa, email, celular, ...(nome !== doc.nome ? { nome } : {}) })],
  };
  if (trocaStatus) campos.respondidoEm = agora;
  if (nome !== doc.nome) campos.nome = nome;
  return { ok: true, mudou: true, campos };
}

/** Recusar: qualquer status → recusou, idempotente. Não apaga acompanhante nem contato (D16, D23) e não exige nada. */
export function recusar(doc: GuestDoc, agora: Date): Mudanca {
  if (doc.status === "recusou") return { ok: true, mudou: false };
  return {
    ok: true,
    mudou: true,
    campos: {
      status: "recusou",
      respondidoEm: agora,
      atualizadoEm: agora,
      historico: [...doc.historico, entrada(doc, agora, "recusou")],
    },
  };
}

/** Acompanhante: só com permissão E confirmado. */
export function definirAcompanhante(doc: GuestDoc, agora: Date, bruto: string): Mudanca {
  if (!doc.acompanhantePermitido || doc.status !== "confirmado") {
    return { ok: false, erro: "ACOMPANHANTE_NAO_PERMITIDO" };
  }
  const nome = validarNome(bruto);
  if (!nome) return { ok: false, erro: "NOME_INVALIDO" };
  if (nome === doc.acompanhanteNome) return { ok: true, mudou: false };
  return {
    ok: true,
    mudou: true,
    campos: {
      acompanhanteNome: nome,
      atualizadoEm: agora,
      historico: [...doc.historico, { em: agora, status: doc.status, acompanhanteNome: nome }],
    },
  };
}

/**
 * Marcação "convidado" (32.10): controle interno do anfitrião, independente da resposta.
 * Não entra no histórico do convidado nem toca status, contato ou respondidoEm.
 */
export function marcarConvidado(doc: GuestDoc, agora: Date, marcar: boolean): Mudanca {
  if (doc.status === "excluido") return { ok: true, mudou: false };
  if (marcar === (doc.convidadoEm !== null)) return { ok: true, mudou: false };
  return { ok: true, mudou: true, campos: { convidadoEm: marcar ? agora : null, atualizadoEm: agora } };
}

/**
 * Permissão de acompanhante pelo painel (32.11): liberar/bloquear, idempotente.
 * Bloquear quem já informou o +1 apaga o nome e registra no histórico; não toca status nem respondidoEm.
 */
export function permitirAcompanhante(doc: GuestDoc, agora: Date, permitir: boolean): Mudanca {
  if (doc.status === "excluido") return { ok: true, mudou: false };
  if (permitir === doc.acompanhantePermitido) return { ok: true, mudou: false };
  if (permitir) return { ok: true, mudou: true, campos: { acompanhantePermitido: true, atualizadoEm: agora } };
  const campos: Partial<GuestDoc> = { acompanhantePermitido: false, atualizadoEm: agora };
  if (doc.acompanhanteNome) {
    campos.acompanhanteNome = null;
    campos.historico = [...doc.historico, { em: agora, status: doc.status, acompanhanteNome: null }];
  }
  return { ok: true, mudou: true, campos };
}

/**
 * Exclusão lógica pelo painel (32.12): qualquer status → excluido, idempotente e sem volta.
 * Não apaga contato, acompanhante nem a marcação "convidado"; o status anterior fica no histórico.
 */
export function excluir(doc: GuestDoc, agora: Date): Mudanca {
  if (doc.status === "excluido") return { ok: true, mudou: false };
  return {
    ok: true,
    mudou: true,
    campos: {
      status: "excluido",
      excluidoEm: agora,
      atualizadoEm: agora,
      historico: [...doc.historico, entrada(doc, agora, "excluido")],
    },
  };
}
