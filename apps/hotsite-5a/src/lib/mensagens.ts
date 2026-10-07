import type { ErroConvite } from "./guests/rules";

/**
 * Mensagens de erro das ações — TEXTO NOVO (o protótipo não tinha falha: era um setTimeout).
 * ⚠️ 32.4 AC 7: proposta da sala, a validar com o Wellington ANTES do merge.
 */
export const MENSAGEM_ERRO: Record<ErroConvite, string> = {
  FALHA_TEMPORARIA: "Não conseguimos registrar sua resposta agora. Tente de novo em instantes.",
  NOME_OBRIGATORIO: "Informe seu nome para confirmar a presença.",
  NOME_INVALIDO: "Confira o nome: use até 80 caracteres.",
  ACOMPANHANTE_NAO_PERMITIDO: "Não foi possível incluir o acompanhante neste convite.",
  CODIGO_INVALIDO: "Este convite não está mais disponível. Confira a mensagem do convite.",
};
