/**
 * Códigos do convite (D8, D20): só A-Z0-9, no máximo 20 caracteres.
 * Nominal: PRIMEIRONOME (≤17 letras) + 3 dígitos. Cota: PATROCINADOR (≤14) + "VIP" + 3 dígitos.
 */
export const CODIGO_RE = /^[A-Z0-9]{1,20}$/;
export const CODIGO_VIP_RE = /^[A-Z]{1,14}VIP[0-9]{3}$/;

export function soLetras(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/** Normaliza o que o convidado digita ou o que vem na URL. */
export function normalizarCodigo(bruto: string | null | undefined): string {
  return (bruto ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function codigoValido(codigo: string): boolean {
  return CODIGO_RE.test(codigo);
}

type Sorteio = () => number; // [0, 1)

function sortearSufixo(rnd: Sorteio): string {
  return String(100 + Math.floor(rnd() * 900));
}

function gerar(base: string, usados: Set<string>, rnd: Sorteio): string {
  // 900 sufixos por base; acima disso não há como ser único.
  for (let i = 0; i < 5000; i++) {
    const c = `${base}${sortearSufixo(rnd)}`;
    if (!usados.has(c)) {
      usados.add(c);
      return c;
    }
  }
  throw new Error(`Sem códigos livres para a base ${base}`);
}

export function primeiroNomeDe(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

export function gerarCodigo(nome: string, usados: Set<string>, rnd: Sorteio = Math.random): string {
  const base = soLetras(primeiroNomeDe(nome)).slice(0, 17) || "CONVIDADO";
  return gerar(base, usados, rnd);
}

export function gerarCodigoVip(patrocinador: string, usados: Set<string>, rnd: Sorteio = Math.random): string {
  const base = soLetras(patrocinador).slice(0, 14);
  if (!base) throw new Error(`Patrocinador sem letras: "${patrocinador}"`);
  return gerar(`${base}VIP`, usados, rnd);
}
