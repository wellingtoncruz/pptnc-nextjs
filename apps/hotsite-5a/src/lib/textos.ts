import type { ConviteAberto } from "./convite";

/**
 * Textos que mudam entre convidado nominal e cota de patrocinador.
 * Nominal = layout do Claude Design + D15 (sem data limite). Cota = D21 (aprovados em 2026-10-07).
 */
export interface Textos {
  rotulo: string;
  titulo: string | null; // null = nome do convidado em destaque (nominal)
  frase: string;
  confirmado: string;
  recusouTitulo: string;
  recusouFrase: string;
  sheetTitulo: string;
  sheetFrase: string;
  finalPergunta: string;
  finalConfirmado: string;
  nota: string;
}

const COMUNS = {
  recusouFrase: "Sua resposta foi registrada. Se a agenda mudar, é só voltar aqui e confirmar.",
};

export function textosPara(c: Pick<ConviteAberto, "cota" | "patrocinador" | "primeiroNome">): Textos {
  if (c.cota) {
    return {
      ...COMUNS,
      rotulo: `Convite ${c.patrocinador ?? ""} · 5 anos`.replace(/\s+/g, " "),
      titulo: "Um convite para você",
      frase: "O PPT Não Compila faz cinco anos. Queremos comemorar com você.",
      confirmado: "Te esperamos no dia 29. Seu nome já está na lista.",
      recusouTitulo: "Que pena.",
      sheetTitulo: "Tem certeza?",
      sheetFrase: "Se der para ajustar a agenda, a gente vai gostar muito de te ver lá.",
      finalPergunta: "Te vejo lá?",
      finalConfirmado: "Até dia 29.",
      nota: "Em cinco anos, o PPT Não Compila virou o que é por causa de quem dividiu com a gente suas histórias. Essa noite é para celebrar, e vai ser um prazer ter você lá.",
    };
  }
  const n = c.primeiroNome ?? "";
  return {
    ...COMUNS,
    rotulo: "Convite pessoal · 5 anos",
    titulo: null,
    frase: "Você faz parte dos cinco anos do PPT Não Compila. Queremos comemorar com você.",
    confirmado: `Te esperamos no dia 29, ${n}. Seu nome já está na lista.`,
    recusouTitulo: `Que pena, ${n}.`,
    sheetTitulo: `Tem certeza, ${n}?`,
    sheetFrase: "A noite foi pensada para quem fez parte desses cinco anos. Se der para ajustar a agenda, a gente vai gostar muito de te ver lá.",
    finalPergunta: `Te vejo lá, ${n}?`,
    finalConfirmado: `Até dia 29, ${n}.`,
    nota: `${n}, em cinco anos o PPT Não Compila virou o que é por causa de quem topou dividir com a gente suas histórias e o que aprendeu no caminho. Essa noite é para agradecer pessoalmente. Conto com você lá.`,
  };
}
