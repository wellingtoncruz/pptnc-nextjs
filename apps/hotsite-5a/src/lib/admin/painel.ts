import type { GuestDoc } from "../guests/schema";
import { formatarCelular } from "../contato";
import { dataBrt, STATUS_PT, totais } from "../export/csv";

/** Painel do anfitrião (32.9): dados puros, sem Firestore. */
export type Filtro = "todos" | "confirmados";

export function lerFiltro(bruto: string | string[] | undefined): Filtro {
  return bruto === "confirmados" ? "confirmados" : "todos";
}

export interface Contadores {
  total: number;
  confirmados: number;
  pendentes: number;
  recusados: number;
  /** Confirmados + acompanhantes confirmados. */
  pessoas: number;
  espera: number;
}

export interface LinhaPainel {
  codigo: string;
  nome: string;
  empresa: string;
  tipo: string;
  status: GuestDoc["status"];
  statusTexto: string;
  acompanhante: string;
  email: string;
  celular: string;
  respondidoEm: string;
}

export interface Painel {
  contadores: Contadores;
  linhas: LinhaPainel[];
}

function acompanhante(d: GuestDoc): string {
  if (!d.acompanhantePermitido) return "—";
  if (d.status === "confirmado" && d.acompanhanteNome) return d.acompanhanteNome;
  return "Liberado";
}

/** Mesma ordem do CSV (A4): nome alfabético PT-BR, cota sem nome no fim. */
function ordenar(docs: GuestDoc[]): GuestDoc[] {
  return [...docs].sort(
    (a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR") || a.codigo.localeCompare(b.codigo)
  );
}

export function montarPainel(docs: GuestDoc[], espera: number, filtro: Filtro): Painel {
  const t = totais(docs);
  const contadores: Contadores = {
    total: docs.length,
    confirmados: t.confirmados,
    pendentes: t.pendentes,
    recusados: t.recusas,
    pessoas: t.esperados,
    espera,
  };
  const visiveis = filtro === "confirmados" ? docs.filter((d) => d.status === "confirmado") : docs;
  const linhas = ordenar(visiveis).map((d): LinhaPainel => {
    const conf = d.status === "confirmado"; // D23: contato só de quem confirmou
    return {
      codigo: d.codigo,
      nome: d.nome ?? "(não preenchido)",
      empresa: d.empresa ?? "",
      tipo: d.cotaPatrocinador ? `Cota · ${d.patrocinador}` : "Nominal",
      status: d.status,
      statusTexto: STATUS_PT[d.status],
      acompanhante: acompanhante(d),
      email: conf ? d.email ?? "" : "",
      celular: conf ? formatarCelular(d.celular) : "",
      respondidoEm: dataBrt(d.respondidoEm),
    };
  });
  return { contadores, linhas };
}
