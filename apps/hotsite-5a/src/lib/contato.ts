/**
 * Validação de contato (D22, D28) — usada na confirmação do convite (32.6)
 * e na lista de espera (32.7).
 */
export const EMAIL_MAX = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** trim + minúsculas; null se vazio, longo demais ou fora de `algo@dominio.tld`. */
export function validarEmail(bruto: string | null | undefined): string | null {
  if (typeof bruto !== "string") return null;
  const email = bruto.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return null;
  return email;
}

/**
 * Celular BR em qualquer formatação → só dígitos (DDD + número, 10 ou 11 dígitos).
 * `+55`/`55` na frente é descartado. Vazio → `{ ok: true, valor: null }` (opcional no convite).
 */
export function validarCelular(bruto: string | null | undefined): { ok: true; valor: string | null } | { ok: false } {
  if (bruto == null || String(bruto).trim() === "") return { ok: true, valor: null };
  let d = String(bruto).replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return { ok: false };
  if (Number(d.slice(0, 2)) < 11) return { ok: false };
  return { ok: true, valor: d };
}

/** "11987654321" → "(11) 98765-4321"; "1133334444" → "(11) 3333-4444". */
export function formatarCelular(digitos: string | null | undefined): string {
  if (!digitos) return "";
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  const corte = resto.length - 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
