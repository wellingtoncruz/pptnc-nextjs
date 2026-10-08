import { afterEach, describe, expect, it, vi } from "vitest";
import { criarToken, senhaAdmin, senhaConfere, SESSAO_MS, tokenValido } from "./sessao";

const SENHA = "senha-de-teste-com-mais-de-20";
const T0 = new Date("2026-10-08T12:00:00Z");

describe("sessão do painel (32.9, D31)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem a env não há senha (falha fechada)", () => {
    vi.stubEnv("HOTSITE_ADMIN_SENHA", "");
    expect(senhaAdmin()).toBeNull();
    vi.stubEnv("HOTSITE_ADMIN_SENHA", SENHA);
    expect(senhaAdmin()).toBe(SENHA);
  });

  it("senha: certa, errada, vazia e não-string", () => {
    expect(senhaConfere(SENHA, SENHA)).toBe(true);
    expect(senhaConfere("outra", SENHA)).toBe(false);
    expect(senhaConfere("", SENHA)).toBe(false);
    expect(senhaConfere(null, SENHA)).toBe(false);
  });

  it("token válido até expirar", () => {
    const t = criarToken(SENHA, T0);
    expect(tokenValido(t, SENHA, T0)).toBe(true);
    expect(tokenValido(t, SENHA, new Date(T0.getTime() + SESSAO_MS - 1))).toBe(true);
    expect(tokenValido(t, SENHA, new Date(T0.getTime() + SESSAO_MS))).toBe(false);
  });

  it("adulterado, malformado ou ausente é inválido", () => {
    const t = criarToken(SENHA, T0);
    const [exp, sig] = t.split(".");
    expect(tokenValido(`${Number(exp) + 1000}.${sig}`, SENHA, T0)).toBe(false);
    expect(tokenValido(`${exp}.${sig.slice(0, -1)}A`, SENHA, T0)).toBe(false);
    expect(tokenValido(`${exp}.${sig}.x`, SENHA, T0)).toBe(false);
    expect(tokenValido("lixo", SENHA, T0)).toBe(false);
    expect(tokenValido(undefined, SENHA, T0)).toBe(false);
  });

  it("trocar a senha derruba as sessões", () => {
    expect(tokenValido(criarToken(SENHA, T0), "nova-senha-de-teste-123456", T0)).toBe(false);
  });
});
