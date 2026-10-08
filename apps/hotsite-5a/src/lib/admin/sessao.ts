import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessão do painel do anfitrião (32.9, D31): senha única + cookie assinado.
 * A senha vem do Secret Manager como env (A3). A chave do HMAC é derivada dela:
 * trocar a senha derruba todas as sessões, sem um segundo secret.
 */
export const COOKIE_ADMIN = "h5a_admin";
export const SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // A2: 7 dias

/** Sem a env, o painel não existe (404, falha fechada). */
export function senhaAdmin(): string | null {
  const s = process.env.HOTSITE_ADMIN_SENHA;
  return s && s.length > 0 ? s : null;
}

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest();
const chave = (senha: string) => sha(`hotsite5a-admin:${senha}`);
const assinar = (senha: string, exp: number) => createHmac("sha256", chave(senha)).update(String(exp)).digest("base64url");

/** Comparação em tempo constante (sobre o hash, para igualar os tamanhos). */
export function senhaConfere(digitada: unknown, senha: string): boolean {
  if (typeof digitada !== "string" || digitada.length === 0) return false;
  return timingSafeEqual(sha(digitada), sha(senha));
}

export function criarToken(senha: string, agora: Date): string {
  const exp = agora.getTime() + SESSAO_MS;
  return `${exp}.${assinar(senha, exp)}`;
}

/** Adulterado, expirado, malformado ou ausente → false. */
export function tokenValido(token: string | undefined, senha: string, agora: Date): boolean {
  if (!token) return false;
  const [expStr, assinatura, ...resto] = token.split(".");
  if (resto.length || !expStr || !assinatura || !/^\d+$/.test(expStr)) return false;
  const exp = Number(expStr);
  if (exp <= agora.getTime()) return false;
  const esperada = Buffer.from(assinar(senha, exp));
  const recebida = Buffer.from(assinatura);
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}
