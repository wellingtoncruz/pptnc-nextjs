const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2022-01-19" → "jan/2022" (rótulo do episódio, D14). */
export function mesAno(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

function decimal(n: number, casas: number): string {
  const s = n.toFixed(casas).replace(".", ",");
  return s.includes(",") ? s.replace(/,?0+$/, "") : s;
}

/** 860 → "860" · 12.400 → "12,4 mil" · 2.650.000 → "2,65 mi". */
export function formatarNumero(n: number): string {
  if (n >= 1_000_000) return `${decimal(Math.floor(n / 10_000) / 100, 2)} mi`;
  if (n >= 1_000) return `${decimal(Math.floor(n / 100) / 10, 1)} mil`;
  return String(n);
}

export function visualizacoes(n: number): string {
  return `${formatarNumero(n)} ${n === 1 ? "visualização" : "visualizações"}`;
}

/** "E mais N episódios com X visualizações." (D14, sem "desde"). */
export function resumoMaisEpisodios(quantidade: number, views: number | null): string {
  const eps = `E mais ${quantidade} ${quantidade === 1 ? "episódio" : "episódios"}`;
  return views == null ? `${eps}.` : `${eps} com ${visualizacoes(views)}.`;
}
