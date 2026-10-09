import type { GuestDoc } from "../guests/schema";
import { formatarCelular } from "../contato";
import { dataBrt, STATUS_PT, totais } from "../export/csv";

/** Painel do anfitrião (32.9/32.10): dados puros, sem Firestore. */
export type Filtro = "todos" | "confirmados";

export function lerFiltro(bruto: string | string[] | undefined): Filtro {
  return bruto === "confirmados" ? "confirmados" : "todos";
}

export interface Contadores {
  /** Todo convite nasce criado: criados = confirmados + não confirmados + recusados. */
  criados: number;
  /** Marcação interna do anfitrião (32.10), independente da resposta. */
  convidados: number;
  confirmados: number;
  naoConfirmados: number;
  recusados: number;
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

/** "08/10 14:02" — a data curta da marcação e da resposta. */
const curta = (d: Date | null) => (d ? dataBrt(d).replace(/\/\d{4}/, "") : "");

export function montarPainel(docs: GuestDoc[], espera: number, filtro: Filtro, baseUrl: string): Painel {
  const t = totais(docs);
  const contadores: Contadores = {
    criados: docs.length,
    convidados: docs.filter((d) => d.convidadoEm).length,
    confirmados: t.confirmados,
    naoConfirmados: t.pendentes,
    recusados: t.recusas,
    pessoas: t.esperados,
    espera,
  };
  const base = baseUrl.replace(/\/+$/, "");
  const visiveis = filtro === "confirmados" ? docs.filter((d) => d.status === "confirmado") : docs;
  const linhas = ordenar(visiveis).map((d): LinhaPainel => {
    const conf = d.status === "confirmado"; // D23: contato só de quem confirmou
    const detalhes: LinhaPainel["detalhes"] = [];
    if (d.empresa) detalhes.push({ texto: d.empresa });
    detalhes.push({ texto: d.codigo, mono: true });
    detalhes.push({ texto: d.cotaPatrocinador ? `Cota · ${d.patrocinador}` : "Nominal" });
    const acomp = acompanhante(d);
    if (acomp) detalhes.push({ texto: acomp });
    if (conf && d.email) detalhes.push({ texto: d.email });
    if (conf && d.celular) detalhes.push({ texto: formatarCelular(d.celular) });
    if (d.respondidoEm) detalhes.push({ texto: `Respondeu ${curta(d.respondidoEm)}` });
    return {
      codigo: d.codigo,
      nome: d.nome ?? "(não preenchido)",
      status: d.status,
      statusTexto: STATUS_PT[d.status],
      detalhes,
      convidado: d.convidadoEm !== null,
      convidadoEm: curta(d.convidadoEm),
      acompanhanteLiberado: d.acompanhantePermitido,
      acompanhanteNome: d.acompanhantePermitido ? d.acompanhanteNome : null,
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
