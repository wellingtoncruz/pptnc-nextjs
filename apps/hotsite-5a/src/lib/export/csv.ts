import type { GuestDoc } from "../guests/schema";

/** CSV PT-BR (32.5): UTF-8 com BOM, separador ';', CRLF. Abre direto no Excel e no Sheets. */
const BOM = "﻿";
const SEP = ";";

export function celula(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const STATUS_PT: Record<GuestDoc["status"], string> = { pendente: "Pendente", confirmado: "Confirmado", recusou: "Recusou" };

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
  "Nome", "Código", "Status", "Cota", "Acompanhante permitido", "Acompanhante",
  "Respondido em", "Nº de respostas", "Primeiro episódio",
];

export function gerarCsv(docs: GuestDoc[], problemas: Problema[] = []): string {
  const ordenados = [...docs].sort((a, b) =>
    (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR") || a.codigo.localeCompare(b.codigo)
  );
  const linhas: (string | number | null)[][] = [COLUNAS];
  for (const d of ordenados) {
    linhas.push([
      d.nome ?? "(não preenchido)",
      d.codigo,
      STATUS_PT[d.status],
      d.cotaPatrocinador ? d.patrocinador : "",
      d.acompanhantePermitido ? "Sim" : "Não",
      d.status === "confirmado" ? d.acompanhanteNome : "", // D16: guardado no doc, fora da lista
      dataBrt(d.respondidoEm),
      d.historico.length,
      d.episodios[0]?.titulo ?? "",
    ]);
  }
  const t = totais(docs);
  linhas.push([], ["TOTAIS"], ["Confirmados", t.confirmados], ["Acompanhantes", t.acompanhantes],
    ["Pessoas esperadas", t.esperados], ["Recusas", t.recusas], ["Pendentes", t.pendentes]);

  const patrocinadores = [...new Set(docs.filter((d) => d.cotaPatrocinador).map((d) => d.patrocinador as string))].sort();
  if (patrocinadores.length) {
    linhas.push([], ["COTAS", "Emitidos", "Confirmados", "Recusas", "Pendentes"]);
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
