import type { GuestDoc } from "../guests/schema";
import { formatarCelular } from "../contato";
import { dataBrt, STATUS_PT, totais } from "../export/csv";
import { respondeu } from "../guests/rules";

/** Painel do anfitrião (32.9/32.10): dados puros, sem Firestore. */
export const FILTROS = ["todos", "confirmados", "convidados-nao-confirmados", "nao-convidados"] as const;
export type Filtro = (typeof FILTROS)[number];

export function lerFiltro(bruto: string | string[] | undefined): Filtro {
  return FILTROS.find((f) => f === bruto) ?? "todos";
}

/**
 * Filtros da lista (32.10, 32.13). Os dois novos deixam o excluído de fora (D46):
 * - convidados não confirmados = marcado como convidado E status "pendente";
 * - não convidados = sem a marcação (quem respondeu sempre está marcado, D47).
 */
export function aplicarFiltro(docs: GuestDoc[], filtro: Filtro): GuestDoc[] {
  switch (filtro) {
    case "confirmados":
      return docs.filter((d) => d.status === "confirmado");
    case "convidados-nao-confirmados":
      return docs.filter((d) => d.convidadoEm !== null && d.status === "pendente");
    case "nao-convidados":
      return docs.filter((d) => d.convidadoEm === null && d.status !== "excluido");
    default:
      return docs;
  }
}

export interface Contadores {
  /** Todo convite nasce criado: criados = confirmados + não confirmados + recusados + excluídos (32.12). */
  criados: number;
  /** Marcação interna do anfitrião (32.10), independente da resposta. Excluído não conta. */
  convidados: number;
  confirmados: number;
  naoConfirmados: number;
  recusados: number;
  excluidos: number;
  /** Confirmados + acompanhantes confirmados. */
  pessoas: number;
  espera: number;
}

export interface LinhaPainel {
  codigo: string;
  nome: string;
  status: GuestDoc["status"];
  statusTexto: string;
  /** Linha 2: só o que existe (empresa, código, tipo, acompanhante, contato, resposta). */
  detalhes: { texto: string; mono?: boolean }[];
  convidado: boolean;
  convidadoEm: string;
  /** 32.13: quem respondeu fica marcado como convidado; o botão não desfaz. */
  marcaTravada: boolean;
  /** 32.11: permissão de +1 e o nome já informado (para a confirmação de remover). */
  acompanhanteLiberado: boolean;
  acompanhanteNome: string | null;
  url: string;
}

export interface Painel {
  contadores: Contadores;
  linhas: LinhaPainel[];
}

function acompanhante(d: GuestDoc): string | null {
  if (!d.acompanhantePermitido) return null;
  if (d.status === "confirmado" && d.acompanhanteNome) return `+1 ${d.acompanhanteNome}`;
  return "Acompanhante liberado";
}

/** Mesma ordem do CSV (A4): nome alfabético PT-BR, cota sem nome no fim. */
function ordenar(docs: GuestDoc[]): GuestDoc[] {
  return [...docs].sort(
    (a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR") || a.codigo.localeCompare(b.codigo)
  );
}

/**
 * 32.14: em "Apenas confirmados", da confirmação mais antiga à mais recente.
 * respondidoEm só muda quando o status vira confirmado (atualizar contato não mexe); sem data vai para o fim.
 * Empate (ou sem data) cai na ordem alfabética.
 */
function ordenarPorConfirmacao(docs: GuestDoc[]): GuestDoc[] {
  const alfa = ordenar(docs);
  const pos = new Map(alfa.map((d, i) => [d.codigo, i]));
  const t = (d: GuestDoc) => d.respondidoEm?.getTime() ?? Infinity;
  return alfa.sort((a, b) => t(a) - t(b) || pos.get(a.codigo)! - pos.get(b.codigo)!);
}

/** "08/10 14:02" — a data curta da marcação e da resposta. */
const curta = (d: Date | null) => (d ? dataBrt(d).replace(/\/\d{4}/, "") : "");

export function montarPainel(docs: GuestDoc[], espera: number, filtro: Filtro, baseUrl: string): Painel {
  const t = totais(docs);
  const contadores: Contadores = {
    criados: docs.length,
    convidados: docs.filter((d) => d.convidadoEm && d.status !== "excluido").length,
    confirmados: t.confirmados,
    naoConfirmados: t.pendentes,
    recusados: t.recusas,
    excluidos: t.excluidos,
    pessoas: t.esperados,
    espera,
  };
  const base = baseUrl.replace(/\/+$/, "");
  const visiveis = aplicarFiltro(docs, filtro);
  const linhas = (filtro === "confirmados" ? ordenarPorConfirmacao : ordenar)(visiveis).map((d): LinhaPainel => {
    const conf = d.status === "confirmado"; // D23: contato só de quem confirmou
    const excluido = d.status === "excluido"; // 32.12: linha só com identificação e data da exclusão
    const detalhes: LinhaPainel["detalhes"] = [];
    if (d.empresa) detalhes.push({ texto: d.empresa });
    detalhes.push({ texto: d.codigo, mono: true });
    detalhes.push({ texto: d.cotaPatrocinador ? `Cota · ${d.patrocinador}` : "Nominal" });
    if (excluido) {
      detalhes.push({ texto: `Excluído ${curta(d.excluidoEm)}`.trim() });
    } else {
      const acomp = acompanhante(d);
      if (acomp) detalhes.push({ texto: acomp });
      if (conf && d.email) detalhes.push({ texto: d.email });
      if (conf && d.celular) detalhes.push({ texto: formatarCelular(d.celular) });
      if (d.respondidoEm) detalhes.push({ texto: `Respondeu ${curta(d.respondidoEm)}` });
    }
    return {
      codigo: d.codigo,
      nome: d.nome ?? "(não preenchido)",
      status: d.status,
      statusTexto: STATUS_PT[d.status],
      detalhes,
      convidado: !excluido && d.convidadoEm !== null,
      convidadoEm: curta(d.convidadoEm),
      marcaTravada: !excluido && respondeu(d) && d.convidadoEm !== null,
      acompanhanteLiberado: !excluido && d.acompanhantePermitido,
      acompanhanteNome: !excluido && d.acompanhantePermitido ? d.acompanhanteNome : null,
      url: `${base}/c/${d.codigo}`,
    };
  });
  return { contadores, linhas };
}

/** Busca do navegador (32.10): pelo nome, sem caixa nem acento. */
export function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function filtrarPorNome<T extends { nome: string }>(linhas: T[], busca: string): T[] {
  const q = normalizarBusca(busca);
  return q ? linhas.filter((l) => normalizarBusca(l.nome).includes(q)) : linhas;
}
