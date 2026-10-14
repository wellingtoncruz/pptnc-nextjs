import type { ErroConvite } from "./guests/rules";
import type { ErroEspera } from "./espera/espera";

/**
 * Mensagens de erro das ações — TEXTO NOVO (o protótipo não tinha falha: era um setTimeout).
 * ⚠️ 32.4 AC 7: proposta da sala, a validar com o Wellington ANTES do merge.
 */
export const MENSAGEM_ERRO: Record<ErroConvite, string> = {
  FALHA_TEMPORARIA: "Não conseguimos registrar sua resposta agora. Tente de novo em instantes.",
  NOME_OBRIGATORIO: "Informe seu nome para confirmar a presença.",
  NOME_INVALIDO: "Confira o nome: use até 80 caracteres.",
  ACOMPANHANTE_NAO_PERMITIDO: "Não foi possível incluir o acompanhante neste convite.",
  // D27 (aprovados em 2026-10-08)
  EMAIL_OBRIGATORIO: "Confira o email digitado.",
  EMAIL_INVALIDO: "Confira o email digitado.",
  CELULAR_INVALIDO: "Confira o celular, com DDD.",
  // E3 (aprovados em 2026-10-08)
  EMPRESA_OBRIGATORIA: "Preencha este campo.",
  EMPRESA_INVALIDA: "Confira a empresa: use até 80 caracteres.",
  CODIGO_INVALIDO: "Este convite não está mais disponível. Confira a mensagem do convite.",
};

/**
 * Lista de espera (32.7). Email e celular: D27; CAMPO_OBRIGATORIO e EMPRESA_INVALIDA: E3 (aprovados).
 */
export const MENSAGEM_ESPERA: Record<ErroEspera | "FALHA_TEMPORARIA", string> = {
  CAMPO_OBRIGATORIO: MENSAGEM_ERRO.EMPRESA_OBRIGATORIA,
  NOME_INVALIDO: MENSAGEM_ERRO.NOME_INVALIDO,
  EMPRESA_INVALIDA: MENSAGEM_ERRO.EMPRESA_INVALIDA,
  EMAIL_INVALIDO: MENSAGEM_ERRO.EMAIL_INVALIDO,
  CELULAR_INVALIDO: MENSAGEM_ERRO.CELULAR_INVALIDO,
  FALHA_TEMPORARIA: MENSAGEM_ERRO.FALHA_TEMPORARIA,
};
