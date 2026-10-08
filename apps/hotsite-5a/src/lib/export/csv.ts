import type { GuestDoc } from "../guests/schema";
import { formatarCelular } from "../contato";
import type { EsperaDoc } from "../espera/espera";

/** CSV PT-BR (32.5): UTF-8 com BOM, separador ';', CRLF. Abre direto no Excel e no Sheets. */
const BOM = "﻿";
const SEP = ";";

export function celula(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const STATUS_PT: Record<GuestDoc["status"], string> = { pendente: "Não confirmado", confirmado: "Confirmado", recusou: "Recusou" };

export function dataBrt(d: Date | null): string {
  if (!d) return "";
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export interface Problema {
  codigo: string;
  motivo: string;
}

export interface Totais {
  confirmados: number;
  acompanhantes: number;
  esperados: number;
  recusas: number;
  pendentes: number;
}

export function totais(docs: GuestDoc[]): Totais {
  const conf = docs.filter((d) => d.status === "confirmado");
  const acomp = conf.filter((d) => d.acompanhanteNome).length;
  return {
    confirmados: conf.length,
    acompanhantes: acomp,
    esperados: conf.length + acomp,
    recusas: docs.filter((d) => d.status === "recusou").length,
    pendentes: docs.filter((d) => d.status === "pendente").length,
  };
}

const COLUNAS = [
  "Nome", "Empresa", "Código", "Status", "Cota", "Acompanhante permitido", "Acompanhante",
  "Email", "Celular", "Respondido em", "Nº de respostas", "Primeiro episódio",
];

/** Confirmado sem email (D22) é dado inconsistente: vai também para "Com problema". */
export function problemasDeContato(docs: GuestDoc[]): Problema[] {
  return docs
    .filter((d) => d.status === "confirmado" && !d.email)
    .map((d) => ({ codigo: d.codigo, motivo: "confirmado sem email" }));
}

export function gerarCsv(docs: GuestDoc[], problemas: Problema[] = []): string {
  const ordenados = [...docs].sort((a, b) =>
    (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR") || a.codigo.localeCompare(b.codigo)
  );
  const linhas: (string | number | null)[][] = [COLUNAS];
  for (const d of ordenados) {
    linhas.push([
      d.nome ?? "(não preenchido)",
      d.empresa, // D30: dado da carga, não contato coletado — vale para todos os status
      d.codigo,
      STATUS_PT[d.status],
      d.cotaPatrocinador ? d.patrocinador : "",
      d.acompanhantePermitido ? "Sim" : "Não",
      d.status === "confirmado" ? d.acompanhanteNome : "", // D16: guardado no doc, fora da lista
      d.status === "confirmado" ? d.email : "", // D23: idem para o contato de quem recusou
      d.status === "confirmado" ? formatarCelular(d.celular) : "",
      dataBrt(d.respondidoEm),
      d.historico.length,
      d.episodios[0]?.titulo ?? "",
    ]);
  }
  const t = totais(docs);
  linhas.push([], ["TOTAIS"], ["Confirmados", t.confirmados], ["Acompanhantes", t.acompanhantes],
    ["Pessoas esperadas", t.esperados], ["Recusas", t.recusas], ["Não confirmados", t.pendentes]);

  const patrocinadores = [...new Set(docs.filter((d) => d.cotaPatrocinador).map((d) => d.patrocinador as string))].sort();
  if (patrocinadores.length) {
    linhas.push([], ["COTAS", "Emitidos", "Confirmados", "Recusas", "Não confirmados"]);
    for (const p of patrocinadores) {
      const c = docs.filter((d) => d.cotaPatrocinador && d.patrocinador === p);
      linhas.push([p, c.length, c.filter((d) => d.status === "confirmado").length,
        c.filter((d) => d.status === "recusou").length, c.filter((d) => d.status === "pendente").length]);
    }
  }
  if (problemas.length) {
    linhas.push([], ["COM PROBLEMA", "Motivo"]);
    for (const p of problemas) linhas.push([p.codigo, p.motivo]);
  }
  return BOM + linhas.map((l) => l.map(celula).join(SEP)).join("\r\n") + "\r\n";
}

/** Lista de espera (32.7): ordem de chegada, sem deduplicar (D24), total de envios no fim. */
export function gerarCsvEspera(docs: EsperaDoc[], problemas: Problema[] = []): string {
  const ordenados = [...docs].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  const linhas: (string | number | null)[][] = [["Nome", "Empresa", "Email", "Celular", "Enviado em"]];
  for (const d of ordenados) linhas.push([d.nome, d.empresa, d.email, formatarCelular(d.celular), dataBrt(d.criadoEm)]);
  linhas.push([], ["Total de envios", docs.length]);
  if (problemas.length) {
    linhas.push([], ["COM PROBLEMA", "Motivo"]);
    for (const p of problemas) linhas.push([p.codigo, p.motivo]);
  }
  return BOM + linhas.map((l) => l.map(celula).join(SEP)).join("\r\n") + "\r\n";
}
